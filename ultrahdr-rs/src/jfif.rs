use std::fmt::{Debug, Formatter};
use std::io;
use std::io::{ErrorKind, Read};

use anyhow::{bail, Result};
use byteorder::{BigEndian, ReadBytesExt};

use crate::readcount::ReadWithCount;

#[derive(Debug)]
pub struct Segment {
    pub start: u64,
    pub len: u64,
    pub kind: SegmentKind,
}

#[derive(Debug)]
pub enum SegmentKind {
    StartOfImage,
    EndOfImage,
    App(AppSegment),
    StartOfFrame(u8),
    StartOfScan,
    DefineHuffmanTable,
    DefineQuantizationTable,
    DefineRestartInterval,
    Restart,
    Comment,
}

pub struct AppSegment {
    pub nr: u8,
    pub data: Vec<u8>,
}

impl AppSegment {
    pub fn name(&self) -> Option<&str> {
        let len = self.data.iter().position(|&ch| !(32..128).contains(&ch))?;
        std::str::from_utf8(&self.data[..len]).ok()
    }

    pub fn has_prefix<P>(&self, prefix: P) -> bool
        where P: AsRef<[u8]>,
    {
        self.data.strip_prefix(prefix.as_ref()).is_some()
    }
}

impl Debug for AppSegment {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            f, "App{}({} bytes, name={:?})",
            self.nr as usize, self.data.len(), self.name().unwrap_or("?"),
        )
    }
}

pub struct Reader<R> {
    reader: ReadWithCount<R>,
    marker: Option<u8>,
}

impl<R> Reader<R>
    where R: Read,
{
    pub fn new(reader: R) -> Result<Self> {
        // wrap into a reader to do position tracking
        let mut reader = ReadWithCount::new(reader);

        // expect to read a jpeg header
        if reader.read_u16::<BigEndian>()? != 0xffd8 {
            bail!("jpeg start of image not found")
        }

        Ok(Self { reader, marker: Some(0xd8) })
    }

    pub fn next(&mut self) -> Result<Option<Segment>> {
        let marker = match self.read_marker() {
            Err(err) if err.kind() == ErrorKind::UnexpectedEof => return Ok(None),
            Err(err) => Err(err)?,
            Ok(marker) => marker,
        };

        // start of the current segment
        let start = self.reader.position() - 2;

        // read the current segment
        let kind = match self.read_marker_segment(marker)? {
            Some(segment) => segment,
            None => return Ok(None),
        };

        // we're now either at the end the current segment
        // or at the beginning of the next marker
        let len = match self.marker.is_some() {
            true => self.reader.position() - 2 - start,
            false => self.reader.position() - start,
        };

        let segment = Segment {
            start: start as u64,
            len: len as u64,
            kind,
        };

        Ok(Some(segment))
    }

    fn read_marker_segment(&mut self, marker: u8) -> Result<Option<SegmentKind>> {
        match marker {
            0xD8 => Ok(Some(SegmentKind::StartOfImage)),

            0xD9 => Ok(Some(SegmentKind::EndOfImage)),

            0xE0..=0xEF => {
                let data = self.read_segment()?;
                let app = AppSegment { nr: marker - 0xE0, data };
                Ok(Some(SegmentKind::App(app)))
            }

            0xC4 => {
                // skip dht segment
                self.skip_segment()?;
                Ok(Some(SegmentKind::DefineHuffmanTable))
            }
            0xDB => {
                // skip dqt segment
                self.skip_segment()?;
                Ok(Some(SegmentKind::DefineQuantizationTable))
            }
            0xC0..=0xC3 | 0xC5..=0xC7 | 0xC9..=0xCB | 0xCD..=0xCF => {
                // skip frame segment
                self.skip_segment()?;
                Ok(Some(SegmentKind::StartOfFrame(marker)))
            }
            0xDA => {
                // skip scan segment
                self.skip_segment()?;
                self.skip_scan_data()?;
                Ok(Some(SegmentKind::StartOfScan))
            }
            0xDD => {
                // skip dri segment
                self.skip_segment()?;
                Ok(Some(SegmentKind::DefineRestartInterval))
            }
            0xD0..=0xD7 => {
                self.skip_scan_data()?;
                Ok(Some(SegmentKind::Restart))
            }
            0xFE => {
                // skip comment segment
                self.skip_segment()?;
                Ok(Some(SegmentKind::Comment))
            }

            // unknown segment
            _ => bail!("Unknown segment marker: {:x?}", marker),
        }
    }

    fn read_marker(&mut self) -> Result<u8, io::Error> {
        let marker = match self.marker.take() {
            Some(marker) => marker,
            None => {
                // skip all 0xff bytes
                while self.reader.read_u8()? != 0xff {}
                self.reader.read_u8()?
            }
        };

        Ok(marker)
    }

    fn read_segment(&mut self) -> Result<Vec<u8>> {
        let len = self.reader.read_u16::<BigEndian>()? - 2;

        let mut res = vec![0; len as usize];
        self.reader.read_exact(&mut res)?;
        Ok(res)
    }

    fn skip_scan_data(&mut self) -> Result<()> {
        loop {
            let byte = self.reader.read_u8()?;

            if byte == 0xFF {
                // Multiple 0xff are not standard compliant but supported by libjpeg
                let mut byte = self.reader.read_u8()?;
                while byte == 0xff {
                    byte = self.reader.read_u8()?;
                }

                if byte != 0x00 {
                    self.marker = Some(byte);
                    break;
                }
            }
        }

        Ok(())
    }

    fn skip_segment(&mut self) -> Result<()> {
        let len = self.reader.read_u16::<BigEndian>()? - 2;

        // discard data
        let mut r = (&mut self.reader).take(len as u64);
        std::io::copy(&mut r, &mut io::empty())?;


        Ok(())
    }
}

#[cfg(test)]
mod test {
    use anyhow::Result;

    use crate::jfif::{Reader, SegmentKind};
    use crate::xmp;

    #[test]
    fn read_jpeg() -> Result<()> {
        let mut reader = Reader::new(
            include_bytes!("../data/PXL_20231231_225945078.jpg").as_slice(),
        )?;

        while let Some(segment) = reader.next()? {
            println!("Segment: {:?}", segment);

            match segment.kind {
                SegmentKind::App(app) => {
                    let Some(data) = app.data.strip_prefix(b"http://ns.adobe.com/xap/1.0/\0") else {
                        continue;
                    };

                    let xml = std::str::from_utf8(data)?;
                    println!("{}", xml);

                    if let Ok(parsed) = xmp::parse_container(xml) {
                        println!("Container: {:?}", parsed);
                    }

                    if let Ok(parsed) = xmp::parse_gainmap(xml) {
                        println!("Gainmap: {:?}", parsed);
                    }
                }

                _ => (),
            }
        }

        Ok(())
    }
}
