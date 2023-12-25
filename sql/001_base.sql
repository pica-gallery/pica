PRAGMA page_size=16384;

CREATE TABLE pica_media
(
    -- the unique id of this media info item
    id        INT8 PRIMARY KEY,

    -- the presentation timestamp of this item in UTC
    timestamp timestamp NOT NULL,

    -- media type. should be either 'image' or 'video'
    type      text      NOT NULL CHECK (type IN ('image', 'video')),

    -- file size of the media item
    bytesize  INT8      NOT NULL,

    -- size of the item in pixels
    width     INT4      NOT NULL CHECK (width > 0),
    height    INT4      NOT NULL CHECK (height > 0),

    -- relative path of this media item. not necessarily utf8
    relpath   blob      NOT NULL,

    -- clean name of the file
    name      text      NOT NULL
);

CREATE INDEX pica_media__timestamp
    ON pica_media (timestamp DESC);

CREATE TABLE pica_image
(
    -- the media this thumbnail references. We do not use a foreign key, because a thumbnail
    -- for a media item will be created before the actual media item is stored in the database.
    media     integer,

    -- the media size of the thumbnail
    size      INT4 NOT NULL,

    -- the thumbnail content (if generation was successful)
    thumbnail blob,

    -- the error that occurred when generating the thumbnail
    error     text,

    PRIMARY KEY (media, size)
);

