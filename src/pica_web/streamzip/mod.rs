use anyhow::Result;
use std::ffi::OsStr;
use std::fs::File;
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
use std::path::Path;
use tracing::{debug, info};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, DateTime};

pub fn write(w: impl Write + Seek + Read, files: &[impl AsRef<Path>]) -> Result<()> {
    let mut zf = zip::ZipWriter::new(w);

    // flush after each file written
    zf.set_flush_on_finish_file(true);

    for file in files {
        let file = file.as_ref();

        let Some(name) = file.file_name().map(OsStr::to_string_lossy) else {
            continue
        };

        info!("Adding file: {:?}", name);
        zf.start_file(name, SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .last_modified_time(DateTime::default_for_write()))?;

        // open the file and copy it to the zip
        let mut file = File::open(file)?;
        std::io::copy(&mut file, &mut zf)?;
    }

    debug!("Flushing remaining data");
    zf.finish()?.flush()?;

    Ok(())
}

pub struct StreamOutput<W> {
    buffer: File,
    sink: W,
    offset: u64,
}

impl<W> StreamOutput<W> {
    pub fn new(sink: W) -> Result<Self> {
        let buffer = tempfile::tempfile()?;
        Ok(Self { buffer, sink, offset: 0 })
    }
}

impl<W: Write> Write for StreamOutput<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buffer.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        // seek to the beginning of the file
        self.buffer.rewind()?;

        // copy to sink
        self.offset += std::io::copy(&mut self.buffer, &mut self.sink)?;

        // rewind again
        self.buffer.rewind()?;

        // and truncate the file to write new data
        self.buffer.set_len(0)
    }
}

impl<W> Seek for StreamOutput<W> {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        let pos = match pos {
            SeekFrom::Start(pos) => {
                if pos < self.offset {
                    return Err(ErrorKind::Unsupported.into());
                }

                SeekFrom::Start(pos - self.offset)
            }

            pos => pos,
        };

        self.buffer.seek(pos).map(|pos| pos + self.offset)
    }
}

impl<W> Read for StreamOutput<W> {
    fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
        Err(ErrorKind::Unsupported.into())
    }
}
