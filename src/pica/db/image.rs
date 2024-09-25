use std::ops::DerefMut;

use anyhow::Result;
use sqlx::{FromRow, Sqlite, Transaction};

use crate::pica::scale::{Image, ImageType};
use crate::pica::MediaId;

#[derive(FromRow)]
struct ImageRow {
    #[sqlx(rename = "type")]
    typ: ImageType,
    content: Vec<u8>,
}

impl From<ImageRow> for Image {
    fn from(value: ImageRow) -> Self {
        Self {
            typ: value.typ,
            blob: value.content,
        }
    }
}

pub async fn store(tx: &mut Transaction<'_, Sqlite>, id: MediaId, size: u32, image: &Image) -> Result<()> {
    let hash = {
        let mut hash = sha1_smol::Sha1::new();
        hash.update(&image.blob);
        hash.hexdigest()
    };
    
    sqlx::query("INSERT OR IGNORE INTO pica_blob_storage (hash, content) VALUES (?, ?)")
        .bind(&hash)
        .bind(&image.blob)
        .execute(tx.deref_mut())
        .await?;
    
    sqlx::query("INSERT INTO pica_image (media, size, type, hash) VALUES (?, ?, ?, ?)")
        .bind(id)
        .bind(size)
        .bind(&image.typ)
        .bind(&hash)
        .execute(tx.deref_mut())
        .await?;

    Ok(())
}

pub async fn load(tx: &mut Transaction<'_, Sqlite>, id: MediaId, size: u32) -> Result<Option<Image>> {
    let sql = r#"
        SELECT type, content
        FROM pica_image
          JOIN pica_blob_storage USING (hash)
        WHERE media=? AND size=?
          AND content IS NOT NULL
    "#;
    let row: Option<ImageRow> =
        sqlx::query_as(sql)
            .bind(id)
            .bind(size)
            .fetch_optional(tx.deref_mut())
            .await?;

    Ok(row.map(Image::from))
}
