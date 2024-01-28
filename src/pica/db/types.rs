use sqlx::database::{HasArguments, HasValueRef};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::Sqlite;

use crate::pica::scale::ImageType;
use crate::pica::Id;

impl<T> sqlx::Type<Sqlite> for Id<T> {
    fn type_info() -> <Sqlite as sqlx::Database>::TypeInfo {
        i64::type_info()
    }

    fn compatible(ty: &<Sqlite as sqlx::Database>::TypeInfo) -> bool {
        i64::compatible(ty)
    }
}

impl<'q, T> sqlx::Encode<'q, Sqlite> for Id<T> {
    fn encode_by_ref(&self, buf: &mut <Sqlite as HasArguments<'q>>::ArgumentBuffer) -> IsNull {
        let value = i64::from_be_bytes(self.value);
        value.encode(buf)
    }
}

impl<'r, T> sqlx::Decode<'r, Sqlite> for Id<T> {
    fn decode(value: <Sqlite as HasValueRef<'r>>::ValueRef) -> Result<Self, BoxDynError> {
        let value = i64::decode(value)?;
        Ok(Id::from(value.to_be_bytes()))
    }
}

impl sqlx::Type<Sqlite> for ImageType {
    fn type_info() -> <Sqlite as sqlx::Database>::TypeInfo {
        str::type_info()
    }
}

impl<'q> sqlx::Encode<'q, Sqlite> for ImageType {
    fn encode_by_ref(&self, buf: &mut <Sqlite as HasArguments<'q>>::ArgumentBuffer) -> IsNull {
        self.mime_type().encode_by_ref(buf)
    }
}

impl<'r> sqlx::Decode<'r, Sqlite> for ImageType {
    fn decode(value: <Sqlite as HasValueRef<'r>>::ValueRef) -> Result<Self, BoxDynError> {
        match String::decode(value)?.as_str() {
            "image/avif" => Ok(Self::Avif),
            "image/jpeg" => Ok(Self::Jpeg),
            value => Err(format!("not valid: {:?}", value).into()),
        }
    }
}
