use std::io;
use std::io::{Read, Seek, SeekFrom};

use anyhow::{anyhow, Result};
use byteorder::{BigEndian, ReadBytesExt};
use hex_literal::hex;
use tracing::debug;

struct Atom<'a, R> {
    name: [u8; 4],
    uuid: Option<[u8; 16]>,
    payload: &'a mut R,
    payload_start: u64,
    payload_end: u64,
}

impl<'a, R> Atom<'a, R> {
    pub fn name(&self) -> Option<&str> {
        std::str::from_utf8(&self.name).ok()
    }
}

impl<'a, R> Atom<'a, R>
    where R: Read + Seek,
{
    pub fn into_iter(self, offset: u64) -> AtomIter<'a, R> {
        AtomIter {
            stream: self.payload,
            next: self.payload_start + offset,
            end: Some(self.payload_end),
        }
    }
}

struct AtomIter<'a, R> {
    stream: &'a mut R,
    next: u64,
    end: Option<u64>,
}

impl<'a, R> AtomIter<'a, R> {
    pub fn new(stream: &'a mut R) -> Self {
        Self { stream, next: 0, end: None }
    }
}

impl<'a, R> AtomIter<'a, R>
    where R: Read + Seek,
{
    pub fn next(&mut self) -> Result<Option<Atom<R>>> {
        // seek to start of the next box
        self.stream.seek(SeekFrom::Start(self.next))?;

        // if we're limited to a specific length, we might need to stop now
        if let Some(length) = self.end.as_mut() {
            if self.next >= *length {
                return Ok(None);
            }
        }

        // read the length and handle eof
        let mut length = match self.stream.read_u32::<BigEndian>() {
            // length of zero means "end of the box"
            Ok(0) => self.end.unwrap_or_default() - self.next,
            Ok(length) => length as u64,
            Err(err) if err.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
            Err(err) => Err(err)?,
        };

        // read name of this box
        let mut name = [0_u8; 4];
        self.stream.read_exact(&mut name)?;

        // capture start of payload
        let mut payload_start = self.next + 8;

        // read size64 if needed
        if length == 1 {
            length = self.stream.read_u64::<BigEndian>()?;
            payload_start += 8;
        }

        let payload_end = self.next + length;

        // point to the start of the next box
        self.next += length;

        // if it is a uuid chunk, read the uuid too
        let mut uuid = None;

        if &name == b"uuid" {
            let mut uuid_bytes = [0; 16];
            self.stream.read_exact(&mut uuid_bytes)?;
            uuid = Some(uuid_bytes);

            payload_start += 16;
        }

        // and return the box
        Ok(Some(Atom { payload_start, payload_end, name, uuid, payload: self.stream }))
    }
}

pub fn read_preview(mut fp: impl Read + Seek) -> Result<Option<impl Read>> {
    let mut iter = AtomIter::new(&mut fp);

    while let Some(atom) = iter.next()? {
        if &atom.name == b"uuid" && atom.uuid == Some(hex!("eaf42b5e1c984b88b9fbb7dc406e4d16")) {
            // found the preview chunk, get iter over children
            let mut iter = atom.into_iter(8);

            // get first child box
            let prvw_box = iter.next()?.ok_or_else(|| anyhow!("expected one subbox"))?;

            // should be the preview box
            if &prvw_box.name != b"PRVW" {
                anyhow::bail!("expected box PRVW, got {:?}", prvw_box.name())
            }

            // skip stuff we do not care about
            prvw_box.payload.seek(SeekFrom::Current(12))?;

            // length of the jpeg data
            let jpeg_size = prvw_box.payload.read_u32::<BigEndian>()? as u64;
            debug!("jpeg size is {}",  jpeg_size);

            return Ok(Some(fp.take(jpeg_size)));
        }
    }

    Ok(None)
}

#[cfg(test)]
mod test {
    use std::fs::File;
    use std::io::{Read, Seek};

    use anyhow::Result;
    use hex_literal::hex;

    use crate::crx::{Atom, AtomIter, read_preview};

    fn has_children<R>(b: &Atom<R>) -> Option<u64> {
        match b.name.as_slice() {
            b"moov" | b"trak" | b"mdia" | b"dinf" | b"stbl" | b"minf" | b"url " => Some(0),
            // container for preview image
            b"uuid" if b.uuid == Some(hex!("eaf42b5e1c984b88b9fbb7dc406e4d16")) => Some(8),
            _ => None,
        }
    }

    fn print_tree<>(mut iter: AtomIter<impl Read + Seek>, depth: usize) -> Result<()> {
        let indent = "                                                               ";
        let mut idx = 0;
        while let Some(atom) = iter.next()? {
            println!("{}{:?} at {}", &indent[..depth], atom.name(), atom.payload_start);

            if let Some(offset) = has_children(&atom) {
                print_tree(atom.into_iter(offset), depth + 2)?;
            }

            idx += 1;
            if idx > 30 {
                break;
            }
        }

        Ok(())
    }

    #[test]
    pub fn test_moov() -> Result<()> {
        // TODO provide test files in the repository
        let mut fp = File::open("../../_test/CR6_1519 (1).CR3")?;
        print_tree(AtomIter::new(&mut fp), 0)?;
        Ok(())
    }

    #[test]
    pub fn test_parse_crx() -> Result<()> {
        // TODO provide test files in the repository
        let mut preview = read_preview(File::open("../../_test/CR6_1519 (1).CR3")?)?.unwrap();
        std::io::copy(&mut preview, &mut File::create("/tmp/preview.jpg")?)?;
        Ok(())
    }
}
