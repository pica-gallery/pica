use std::io::Write;

use byteorder::{LittleEndian, WriteBytesExt};

const NUM_PICTURES: usize = 2;
const TAG_SERIALIZED_COUNT: u16 = 3;

const TYPE_LONG: u16 = 0x4;
const TYPE_UNDEFINED: u16 = 0x7;

const MPF_SIG: &[u8; 4] = b"MPF\0";
const MP_LITTLE_ENDIAN: &[u8; 4] = &[0x49, 0x49, 0x2A, 0x00];

const VERSION_TAG: u16 = 0xB000;
const VERSION_TYPE: u16 = TYPE_UNDEFINED;
const VERSION_COUNT: u32 = 4;
const VERSION_EXPECTED: &[u8; 4] = b"0100";

const NUMBER_OF_IMAGES_TAG: u16 = 0xB001;
const NUMBER_OF_IMAGES_TYPE: u16 = TYPE_LONG;
const NUMBER_OF_IMAGES_COUNT: u32 = 1;

const MP_ENTRY_TAG: u16 = 0xB002;
const MP_ENTRY_TYPE: u16 = TYPE_UNDEFINED;
const MP_ENTRY_SIZE: u32 = 16;

const MP_ENTRY_ATTRIBUTE_FORMAT_JPEG: u32 = 0x0000000;
const MP_ENTRY_ATTRIBUTE_TYPE_PRIMARY: u32 = 0x030000;

pub struct Picture {
    pub offset: u32,
    pub len: u32,
}

pub fn generate(primary: Picture, secondary: Picture) -> Vec<u8> {
    let mut buf: Vec<u8> = Vec::new();
    _ = buf.write_all(MPF_SIG);
    _ = buf.write_all(MP_LITTLE_ENDIAN);

    // Set the Index IFD offset be the position after the endianness value and this offset.
    let index_ifd_offset = MP_LITTLE_ENDIAN.len() as u32 + MPF_SIG.len() as u32;
    _ = buf.write_u32::<LittleEndian>(index_ifd_offset);

    // We will write 3 tags (version, number of images, MP entries).
    _ = buf.write_u16::<LittleEndian>(TAG_SERIALIZED_COUNT);

    // Write the version tag.
    _ = buf.write_u16::<LittleEndian>(VERSION_TAG);
    _ = buf.write_u16::<LittleEndian>(VERSION_TYPE);
    _ = buf.write_u32::<LittleEndian>(VERSION_COUNT);
    _ = buf.write_all(VERSION_EXPECTED);

    // Write the number of images.
    _ = buf.write_u16::<LittleEndian>(NUMBER_OF_IMAGES_TAG);
    _ = buf.write_u16::<LittleEndian>(NUMBER_OF_IMAGES_TYPE);
    _ = buf.write_u32::<LittleEndian>(NUMBER_OF_IMAGES_COUNT);
    _ = buf.write_u32::<LittleEndian>(NUM_PICTURES as u32);

    // Write the MP entries.
    _ = buf.write_u16::<LittleEndian>(MP_ENTRY_TAG);
    _ = buf.write_u16::<LittleEndian>(MP_ENTRY_TYPE);
    _ = buf.write_u32::<LittleEndian>(MP_ENTRY_SIZE * NUM_PICTURES as u32);
    _ = buf.write_u32::<LittleEndian>(buf.len() as u32 - MPF_SIG.len() as u32 + 8);

    // Write the attribute IFD offset (zero because we don't write it).
    _ = buf.write_u32::<LittleEndian>(0);

    // Write the MP entries for primary image
    _ = buf.write_u32::<LittleEndian>(MP_ENTRY_ATTRIBUTE_FORMAT_JPEG | MP_ENTRY_ATTRIBUTE_TYPE_PRIMARY);
    _ = buf.write_u32::<LittleEndian>(primary.len);
    _ = buf.write_u32::<LittleEndian>(primary.offset);
    _ = buf.write_u16::<LittleEndian>(0);
    _ = buf.write_u16::<LittleEndian>(0);

    // Write the MP entries for secondary image
    _ = buf.write_u32::<LittleEndian>(MP_ENTRY_ATTRIBUTE_FORMAT_JPEG);
    _ = buf.write_u32::<LittleEndian>(secondary.len);
    _ = buf.write_u32::<LittleEndian>(secondary.offset);
    _ = buf.write_u16::<LittleEndian>(0);
    _ = buf.write_u16::<LittleEndian>(0);

    buf
}

pub fn len() -> usize {
    let primary = Picture { offset: 0, len: 0 };
    let secondary = Picture { offset: 0, len: 0 };
    generate(primary, secondary).len()
}
