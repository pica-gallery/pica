PRAGMA page_size=16384;

CREATE TABLE pica_media_cache
(
    -- the unique id of this media info item. This is derived from
    -- the source and relpath and the byte size of the file.
    id        integer PRIMARY KEY,

    -- source id of this media info item.
    source    text      NOT NULL,

    -- relative path of this media item.
    -- Stored as a blob as the path is not necessarily utf8
    relpath   blob      NOT NULL,

    -- file size of the media item
    bytesize  INT8      NOT NULL,

    -- size of the item in pixels
    width     INT4      NOT NULL,
    height    INT4      NOT NULL,

    -- the presentation timestamp of this media in UTC. This might
    -- come from the exif data of the file
    timestamp timestamp NOT NULL,

    -- gps location extracted from exif data
    latitude  float4,
    longitude float4,

    -- ensure we do not store broken data
    CHECK (width > 0 AND height > 0),
    CHECK (NOT (latitude == 0 AND longitude == 0)),

    -- make sure that we only index every path & byte size once.
    -- this index is just an extra check to ensure id generation works.
    UNIQUE (source, relpath, bytesize)
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
    media integer REFERENCES pica_media_cache (id),

    -- the pixel size of the image (max (width, height))
    size  INT4 NOT NULL,

    -- image type of the image.
    type  text NOT NULL,

    -- the error that occurred when generating the thumbnail
    error text,

    -- the thumbnail content ref (if generation was successful)
    hash  text REFERENCES pica_blob_storage (hash),

    PRIMARY KEY (media, size)
);

CREATE TABLE pica_blob_storage
(
    hash     text PRIMARY KEY,

    -- store the file size of this image (for debugging purposes)
    bytesize INT4 GENERATED ALWAYS AS (LENGTH(content)),

    content  blob
);
