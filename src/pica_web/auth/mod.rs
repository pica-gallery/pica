use async_trait::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::StatusCode;
use axum_login::{AuthUser, AuthnBackend, UserId};
use htpasswd_verify::{Hash, MD5Hash};
use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::Arc;

pub type AuthSession = axum_login::AuthSession<Backend>;

#[derive(Debug, Clone)]
pub struct User {
    pub name: String,

    // this is used in the session to invalidate sessions if the
    // password of the user has changed
    pub pw_hash: Box<[u8]>,

    // hash is not Clone, so we need to wrap it into an Arc to make it Clone + Send
    pub hash: Arc<Hash<'static>>,
}

impl User {
    pub fn new(name: impl Into<String>, password: impl AsRef<str>) -> Self {
        let hash = hash_to_owned(Hash::parse(password.as_ref()));

        User {
            name: name.into(),
            hash: Arc::new(hash),
            pw_hash: {
                let sha1 = sha1_smol::Sha1::from(password.as_ref().as_bytes());
                Box::new(sha1.digest().bytes())
            },
        }
    }
}

impl AuthUser for User {
    type Id = String;

    fn id(&self) -> Self::Id {
        self.name.clone()
    }

    fn session_auth_hash(&self) -> &[u8] {
        &self.pw_hash
    }
}

impl<S> FromRequestParts<S> for User
    where
        S: Send + Sync,
{
    type Rejection = (StatusCode, &'static str);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let session = AuthSession::from_request_parts(parts, state).await?;

        match session.user {
            Some(user) => Ok(user),
            None => Err((StatusCode::UNAUTHORIZED, "not authorized"))
        }
    }
}

#[derive(Clone, Default)]
pub struct Backend {
    pub users: HashMap<String, User>,
}

impl From<Vec<User>> for Backend {
    fn from(users: Vec<User>) -> Self {
        Self {
            users: users
                .into_iter()
                .map(|user| (user.name.to_owned(), user))
                .collect(),
        }
    }
}

#[derive(Clone)]
pub struct Credentials {
    pub username: String,
    pub password: String,
}

#[async_trait]
impl AuthnBackend for Backend {
    type User = User;
    type Credentials = Credentials;
    type Error = std::convert::Infallible;

    async fn authenticate(&self, credentials: Self::Credentials) -> Result<Option<Self::User>, Self::Error> {
        let Some(user) = self.users.get(&credentials.username) else {
            return Ok(None);
        };

        // check that password matches the users password hash
        if !user.hash.check(credentials.password) {
            return Ok(None);
        }

        Ok(Some(user.clone()))
    }

    async fn get_user(&self, user_id: &UserId<Self>) -> Result<Option<Self::User>, Self::Error> {
        Ok(self.users.get(user_id).cloned())
    }
}

fn hash_to_owned(hash: Hash) -> Hash<'static> {
    match hash {
        Hash::MD5(MD5Hash { salt, hash }) => Hash::MD5(MD5Hash {
            salt: Cow::Owned(salt.into_owned()),
            hash: Cow::Owned(hash.into_owned()),
        }),
        Hash::BCrypt(hash) => Hash::BCrypt(Cow::Owned(hash.into_owned())),
        Hash::SHA1(hash) => Hash::SHA1(Cow::Owned(hash.into_owned())),
        Hash::Crypt(hash) => Hash::Crypt(Cow::Owned(hash.into_owned())),
    }
}
