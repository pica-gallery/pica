use std::io;
use std::io::{Read, Write};

pub struct ReadWithCount<R> {
    reader: R,
    position: usize,
}

impl<R> ReadWithCount<R> {
    pub fn new(reader: R) -> Self {
        Self { reader, position: 0 }
    }

    pub fn position(&self) -> usize {
        self.position
    }
}

impl<R: Read> Read for ReadWithCount<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.reader.read(buf)?;
        self.position += n;
        Ok(n)
    }
}

pub struct WriteWithCount<W> {
    writer: W,
    position: usize,
}

impl<W> WriteWithCount<W> {
    pub fn new(writer: W) -> Self {
        Self { writer, position: 0 }
    }

    pub fn position(&self) -> usize {
        self.position
    }
}

impl<W> Write for WriteWithCount<W>
    where W: Write,
{
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let n = self.writer.write(buf)?;
        self.position += n;
        Ok(n)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.writer.flush()
    }
}
