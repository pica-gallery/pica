use sqlx::database::{HasArguments, HasValueRef};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::Sqlite;

use crate::pica::Id;
use crate::pica::scale::ImageType;

impl<T> sqlx::Type<Sqlite> for Id<T> {
    fn type_info() -> <Sqlite as sqlx::Database>::TypeInfo {
        <i64 as sqlx::Type<Sqlite>>::type_info()
    }

    fn compatible(ty: &<Sqlite as sqlx::Database>::TypeInfo) -> bool {
        <i64 as sqlx::Type<Sqlite>>::compatible(ty)
    }
}

impl<'q, T> sqlx::Encode<'q, Sqlite> for Id<T> {
    fn encode_by_ref(&self, buf: &mut <Sqlite as HasArguments<'q>>::ArgumentBuffer) -> IsNull {
        let value = i64::from_be_bytes(self.value);
        sqlx::Encode::<'q, Sqlite>::encode(value, buf)
    }
}

impl<'r, T> sqlx::Decode<'r, Sqlite> for Id<T> {
    fn decode(value: <Sqlite as HasValueRef<'r>>::ValueRef) -> Result<Self, BoxDynError> {
        let value = <i64 as sqlx::Decode<'r, Sqlite>>::decode(value)?;
        Ok(Id::from(value.to_be_bytes()))
    }
}

impl sqlx::Type<Sqlite> for ImageType {
    fn type_info() -> <Sqlite as sqlx::Database>::TypeInfo {
        <str as sqlx::Type<Sqlite>>::type_info()
    }
}

impl<'q> sqlx::Encode<'q, Sqlite> for ImageType {
    fn encode_by_ref(&self, buf: &mut <Sqlite as HasArguments<'q>>::ArgumentBuffer) -> IsNull {
        sqlx::Encode::<'q, Sqlite>::encode(self.mime_type(), buf)
    }
}

impl<'r> sqlx::Decode<'r, Sqlite> for ImageType {
    fn decode(value: <Sqlite as HasValueRef<'r>>::ValueRef) -> Result<Self, BoxDynError> {
        match <String as sqlx::Decode<'r, Sqlite>>::decode(value)?.as_str() {
            "image/avif" => Ok(Self::Avif),
            "image/jpeg" => Ok(Self::Jpeg),
            value => Err(format!("not valid: {:?}", value).into()),
        }
    }
}
