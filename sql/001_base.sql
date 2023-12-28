PRAGMA page_size=16384;

CREATE TABLE pica_media
(
    -- the unique id of this media info item. This is derived from
    -- the relpath and the byte size of the file.
    id        integer PRIMARY KEY,

    -- the presentation timestamp of this item in UTC
    timestamp timestamp NOT NULL,

    -- media type. should be either 'image' or 'video'
    type      text      NOT NULL
        CHECK (type IN ('image', 'video')),

    -- file size of the media item
    bytesize  INT8      NOT NULL,

    -- size of the item in pixels
    width     INT4      NOT NULL,
    height    INT4      NOT NULL,

    -- relative path of this media item. not necessarily utf8
    relpath   blob      NOT NULL,

    -- clean name of the file
    name      text      NOT NULL,

    CHECK (width > 0 AND height > 0),

    -- only index every path & byte size once
    UNIQUE (relpath, bytesize)
);

CREATE TABLE pica_media_error
(
    -- the unique id of this media info item.
    -- Same as with pica_media.id
    id    integer PRIMARY KEY,
    error text NOT NULL
);


CREATE TABLE pica_image
(
    -- the media this image references.
    media    integer REFERENCES pica_media (id),

    -- the pixel size of the image (max (width, height))
    size     INT4 NOT NULL,

    -- store the file size of this image (for debugging purposes)
    bytesize INT4 GENERATED ALWAYS AS (LENGTH(content)),

    -- image type of the image.
    type     text NOT NULL,

    -- the error that occurred when generating the thumbnail
    error    text,

    -- the thumbnail content (if generation was successful)
    content  blob,


    PRIMARY KEY (media, size)
);


-- CREATE TABLE pica_album
-- (
--     id        integer PRIMARY KEY AUTOINCREMENT,
--
--     -- name of the album. This should match the directory on the filesystem
--     name      text      NOT NULL,
--
--     -- The parent album, or null, if this is a root level album
--     parent    integer REFERENCES pica_album (id),
--
--     -- If the album is based on a path on the file system,
--     -- relpath holds the relative path to the albums directory. This is a
--     -- blob because path names do not need to be utf8
--     relpath   blob UNIQUE,
--
--     -- the albums timestamp.
--     timestamp TIMESTAMP NOT NULL
-- );
--
-- -- Quickly find all child albums by their parent id.
-- CREATE INDEX pica_album__parent
--     ON pica_album (parent);
--
-- CREATE TABLE pica_album_member
-- (
--     album integer REFERENCES pica_album (id),
--     media integer REFERENCES pica_media (id),
--
--     PRIMARY KEY (album, media)
-- );
