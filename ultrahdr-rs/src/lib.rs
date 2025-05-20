use std::fmt::{Debug, Formatter};
use std::io;
use std::io::{Read, Seek, Write};

use anyhow::{anyhow, Result};
use byteorder::{BigEndian, WriteBytesExt};
use tee_readwrite::TeeReader;

pub use crate::jfif::SegmentKind;
use crate::readcount::WriteWithCount;

mod xmp;
mod jfif;
mod readcount;
mod mpf;

pub struct SerializedSegment {
    pub kind: SegmentKind,
    pub offset: usize,
    pub bytes: Vec<u8>,
}

impl Debug for SerializedSegment {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "SerializedSegment({:?}, offset={}, len={})", self.kind, self.offset, self.bytes.len())
    }
}

#[derive(Debug)]
pub struct Jpeg {
    pub segments: Vec<SerializedSegment>,
}

impl Jpeg {
    pub fn from_bytes(r: impl AsRef<[u8]>) -> Result<Self> {
        Self::from_reader(r.as_ref())
    }

    /// Parses the first jpeg from the given reader into a list of segments.
    /// This method will hold all the data read into memory up to two times.
    pub fn from_reader<R>(r: R) -> Result<Self>
        where R: Read,
    {
        let mut buf = Vec::new();
        let mut segments = Vec::new();

        let tee = TeeReader::new(r, &mut buf, false);

        let mut reader = jfif::Reader::new(tee)?;

        while let Some(segment) = reader.next()? {
            let eoi = matches!(&segment.kind, SegmentKind::EndOfImage);
            segments.push(segment);

            // reached the end of the image
            if eoi {
                break;
            }
        }

        let mut serialized = Vec::new();

        for segment in segments {
            let segment_offset = segment.start as usize;
            let segment_last_exclusive = (segment.start + segment.len) as usize;

            let ss = SerializedSegment {
                kind: segment.kind,
                offset: segment_offset,
                bytes: buf[segment_offset..segment_last_exclusive].into(),
            };

            serialized.push(ss);
        }

        let jpeg = Self { segments: serialized };

        Ok(jpeg)
    }

    pub fn bytes_len(&self) -> usize {
        self.segments.iter()
            .map(|seg| seg.bytes.len())
            .sum()
    }

    pub fn write_to<W>(&self, mut w: W) -> Result<()>
        where W: Write,
    {
        for segment in &self.segments {
            w.write_all(&segment.bytes)?;
        }

        Ok(())
    }

    pub fn as_read<'a>(&'a self) -> impl Read + Seek + 'a {
        let bytes: Vec<_> = self.segments.iter()
            .flat_map(|seg| seg.bytes.iter().copied())
            .collect();

        io::Cursor::new(bytes)

        // JpegRead {
        //     position: 0,
        //     jpeg: self,
        // }
    }
}

// Writes an ultra hdr image based on two input images.
// The first input image needs to be a normal jpeg image while the second
// one is required to be a gainmap.
pub fn write_ultra_hdr<W>(write: W, primary: &Jpeg, gainmap: &Jpeg) -> Result<()>
    where W: Write,
{
    let segments: Vec<_> = primary.segments.iter()
        .filter(|seg| segment_to_keep(seg))
        .collect();

    // TODO verify that the gainmap contains the appropriate xmp data chunk

    // generate the xmp segment from the length of the gainmap
    //  TODO merge with existing xmp segment from the primary
    let xmp_segment = generate_xmp_segment(gainmap.bytes_len());

    // calculate length of primary image
    let xmp_segment_len = xmp_segment.len() + 4;
    let mpf_segment_len = mpf::len() + 4;
    let rest_segments_len: usize = segments.iter().map(|seg| seg.bytes.len()).sum();
    let primary_image_len: usize = rest_segments_len + xmp_segment_len + mpf_segment_len;

    // keep track of the current writer position
    let mut write = WriteWithCount::new(write);

    let mut metadata_written = false;

    // write segments from primary image
    for segment in &segments {
        let write_metadata = !metadata_written && match &segment.kind {
            SegmentKind::App(app) => {
                app.has_prefix(b"http://ns.adobe.com/xmp/extension/\0")
            }

            SegmentKind::StartOfFrame(_) => true,
            SegmentKind::StartOfScan => true,
            SegmentKind::DefineHuffmanTable => true,
            SegmentKind::DefineQuantizationTable => true,
            SegmentKind::DefineRestartInterval => true,

            _ => false,
        };

        if write_metadata {
            // write xmp as app1 marker
            write_segment(&mut write, 0xe1, &xmp_segment)?;

            // generate the mpf segment
            let mpf_primary = mpf::Picture {
                offset: 0,
                len: primary_image_len as u32,
            };

            let mpf_gainmap = mpf::Picture {
                offset: primary_image_len as u32 - write.position() as u32 - 8,
                len: gainmap.bytes_len() as _,
            };

            // write mpf as app2 marker
            let mpf_segment = mpf::generate(mpf_primary, mpf_gainmap);
            write_segment(&mut write, 0xE2, &mpf_segment)?;

            metadata_written = true;
        }

        // copy this segment directly to the target
        write.write_all(&segment.bytes)?;
    }

    // append the gainmap to the image file
    gainmap.write_to(write)?;

    Ok(())
}

fn segment_to_keep(segment: &SerializedSegment) -> bool {
    match &segment.kind {
        SegmentKind::App(app) if app.has_prefix(b"MPF\0") => false,
        SegmentKind::App(app) if app.has_prefix(b"http://ns.adobe.com/xap/1.0/\0") => false,

        // keep
        _ => true,
    }
}

fn generate_xmp_segment(gainmap_len: usize) -> Vec<u8> {
    let signature = "http://ns.adobe.com/xap/1.0/\0";

    let xmp = format!(r#"{signature}<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.0-jc003">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"
        xmlns:xmpNote="http://ns.adobe.com/xmp/note/"
        xmlns:Container="http://ns.google.com/photos/1.0/container/"
        xmlns:Item="http://ns.google.com/photos/1.0/container/item/"
      hdrgm:Version="1.0">
      <Container:Directory>
        <rdf:Seq>
          <rdf:li rdf:parseType="Resource">
            <Container:Item
              Item:Semantic="Primary"
              Item:Mime="image/jpeg"/>
          </rdf:li>
          <rdf:li rdf:parseType="Resource">
            <Container:Item
              Item:Semantic="GainMap"
              Item:Mime="image/jpeg"
              Item:Length="{gainmap_len}"/>
          </rdf:li>
        </rdf:Seq>
      </Container:Directory>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
"#);

    xmp.into()
}

fn write_segment<W>(mut w: W, marker: u8, data: &[u8]) -> Result<()>
    where W: Write,
{
    w.write_u8(0xff)?;
    w.write_u8(marker)?;
    w.write_u16::<BigEndian>(data.len() as u16 + 2)?;
    w.write_all(data)?;

    Ok(())
}

pub fn is_ultrahdr<R>(r: R) -> Result<bool>
    where R: Read,
{
    let mut reader = jfif::Reader::new(r)?;

    let mut has_mpf = false;
    let mut has_xmp_container = false;

    while let Some(segment) = reader.next()? {
        match &segment.kind {
            SegmentKind::StartOfImage | SegmentKind::Comment => {
                continue;
            }

            SegmentKind::App(app) => {
                // test if it might be xmp data
                if let Some(data) = app.data.strip_prefix(b"http://ns.adobe.com/xap/1.0/\0") {
                    // this looks like some xmp metadata. we'll try to parse its xml value
                    if let Ok(xmp) = xmp::parse_container(data) {
                        has_xmp_container = xmp.rdf.description.directory.seq.li.len() >= 2;
                    }
                };

                // test if it might be mpf data
                if let Some(_data) = app.data.strip_prefix(b"MPF\0") {
                    has_mpf = true;
                };
            }

            _ => break
        }
    }

    Ok(has_mpf && has_xmp_container)
}

pub struct UltraHDR {
    pub primary: Jpeg,
    pub gainmap: Jpeg,
}

impl UltraHDR {
    pub fn from_reader<R>(mut r: R) -> Result<Self>
        where R: Read,
    {
        // read first image from reader
        let mut primary = Jpeg::from_reader(&mut r)?;

        // get the xmp data from the first image
        let _xmp_container = parse_xmp_container(&primary)?.ok_or_else(|| anyhow!("no Container in first image"))?;

        // parse the gainmap
        let gainmap = Jpeg::from_reader(&mut r)?;

        // parse the gainmap to validate the format
        let _xmp_gainmap = parse_gainmap(&gainmap)?.ok_or_else(|| anyhow!("no Gainmap in second image"))?;

        // remove the mpf and container segment from the primary image
        primary.segments.retain(segment_to_keep);

        Ok(Self { primary, gainmap })
    }
}


fn parse_gainmap(image: &Jpeg) -> Result<Option<xmp::gainmap::Xmp>> {
    for segment in &image.segments {
        let SegmentKind::App(app) = &segment.kind else {
            continue;
        };

        // test if it might be xmp data
        let Some(data) = app.data.strip_prefix(b"http://ns.adobe.com/xap/1.0/\0") else {
            continue;
        };

        // this looks like some xmp metadata. we'll try to parse its xml value
        let xmp = xmp::parse_gainmap(data)?;

        // looks good, this seems to be a gainmap
        return Ok(Some(xmp));
    }

    // probably not a gain map
    Ok(None)
}


fn parse_xmp_container(jpeg: &Jpeg) -> Result<Option<xmp::primary::Xmp>> {
    for segment in &jpeg.segments {
        let SegmentKind::App(app) = &segment.kind else {
            continue;
        };

        // test if it might be xmp data
        let Some(data) = app.data.strip_prefix(b"http://ns.adobe.com/xap/1.0/\0") else {
            continue;
        };

        // this looks like some xmp metadata. we'll try to parse its xml value
        let xmp = xmp::parse_container(data)?;

        // looks good, this seems to be a container
        return Ok(Some(xmp));
    }

    // did not find any container
    Ok(None)
}

#[cfg(test)]
mod test {
    use std::io;

    use hex_literal::hex;
    use sha1_smol::Sha1;

    use crate::{Jpeg, UltraHDR};

    #[test]
    fn ultrahdr_from_reader() -> anyhow::Result<()> {
        let r = include_bytes!("../data/PXL_20240128_125632590.jpg").as_slice();
        let uhdr = UltraHDR::from_reader(r)?;

        dbg!(&uhdr.primary.segments);
        dbg!(&uhdr.gainmap.segments);

        Ok(())
    }

    #[test]
    fn ultrahdr_primary() -> anyhow::Result<()> {
        let r = include_bytes!("../data/PXL_20240128_125632590.jpg").as_slice();
        let uhdr = UltraHDR::from_reader(r)?;

        let mut hash = Sha1::new();
        uhdr.primary.write_to(Write(&mut hash))?;

        println!("Hash: {:?}", hash.digest());
        assert_eq!(hash.digest().bytes(), hex!("5464354c806b8aefa72e6dbeda01f61b2a11e0c3"));

        Ok(())
    }

    #[test]
    fn ultrahdr_gainmap() -> anyhow::Result<()> {
        let r = include_bytes!("../data/PXL_20240128_125632590.jpg").as_slice();
        let uhdr = UltraHDR::from_reader(r)?;

        let mut hash = Sha1::new();
        uhdr.gainmap.write_to(Write(&mut hash))?;

        println!("Hash: {:?}", hash.digest());
        assert_eq!(hash.digest().bytes(), hex!("b94c93af12068720576f9657b3619b8b20b27ba7"));

        Ok(())
    }

    #[test]
    fn write_ultra_hdr() -> anyhow::Result<()> {
        let primary = Jpeg::from_bytes(include_bytes!("../data/_primary-25.jpg"))?;
        let gainmap = Jpeg::from_bytes(include_bytes!("../data/_gainmap.jpg"))?;

        let mut hash = Sha1::new();
        super::write_ultra_hdr(Write(&mut hash), &primary, &gainmap)?;

        println!("Hash: {:?}", hash.digest());
        assert_eq!(hash.digest().bytes(), hex!("b33512d5f69987da56669bfbd7d05bb3d04a3314"));

        Ok(())
    }

    struct Write<'a>(&'a mut Sha1);

    impl<'a> io::Write for Write<'a> {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0.update(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
}
