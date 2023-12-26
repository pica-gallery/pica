PRAGMA page_size=16384;

CREATE TABLE pica_media
(
    -- the unique id of this media info item
    id               INT8 PRIMARY KEY,

    -- the presentation timestamp of this item in UTC
    timestamp        timestamp NOT NULL,

    -- media type. should be either 'image' or 'video'
    type             text      NOT NULL
        CHECK (type IN ('image', 'video')),

    -- the indexing state of this media item
    indexing_done    bool,
    indexing_error   text DEFAULT NULL,
    indexing_success bool GENERATED ALWAYS AS (indexing_done AND indexing_error IS NULL),

    -- file size of the media item
    bytesize         INT8      NOT NULL,

    -- size of the item in pixels
    width            INT4      NOT NULL,
    height           INT4      NOT NULL,

    -- relative path of this media item. not necessarily utf8
    relpath          blob      NOT NULL,

    -- clean name of the file
    name             text      NOT NULL,

    CHECK (width > 0 AND height > 0)
);

-- we want to do quick lookups by timestamp
CREATE INDEX pica_media__timestamp
    ON pica_media (timestamp DESC)
    WHERE indexing_success;


CREATE TABLE pica_image
(
    -- the media this image references.
    media    integer REFERENCES pica_media (id),

    -- the pixel size of the image (max (width, height))
    size     INT4 NOT NULL,

    -- store the file size of this image (for debugging purposes)
    bytesize INT4 GENERATED ALWAYS AS (LENGTH(content)),

    -- image type of the image.
    type     text NOT NULL
        CHECK (type IN ('jpeg', 'avif')),

    -- the error that occurred when generating the thumbnail
    error    text,

    -- the thumbnail content (if generation was successful)
    content  blob,


    PRIMARY KEY (media, size)
);

