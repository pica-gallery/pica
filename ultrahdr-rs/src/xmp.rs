use std::io::{BufReader};

use anyhow::Result;

pub fn parse_container(xml: impl AsRef<[u8]>) -> Result<primary::Xmp> {
    let data = BufReader::new(xml.as_ref());

    // We are pretty lenient in what we accept. It should just kind of match the
    // expected structure. We currently do not care about the namespaces
    Ok(quick_xml::de::from_reader(data)?)
}

pub fn parse_gainmap(xml: impl AsRef<[u8]>) -> Result<gainmap::Xmp> {
    let data = BufReader::new(xml.as_ref());

    // We are pretty lenient in what we accept. It should just kind of match the
    // expected structure. We currently do not care about the namespaces
    Ok(quick_xml::de::from_reader(data)?)
}

pub mod gainmap {
    use serde::Deserialize;

    #[derive(Deserialize, Debug)]
    pub struct Xmp {
        #[serde(rename = "RDF")]
        pub rdf: Rdf,
    }

    #[derive(Deserialize, Debug)]
    pub struct Rdf {
        #[serde(rename = "Description")]
        pub description: Description,
    }

    #[derive(Deserialize, Debug)]
    pub struct Description {
        #[serde(rename = "@Version")]
        pub version: String,

        #[serde(rename = "@GainMapMin")]
        pub gainmap_min: f64,

        #[serde(rename = "@GainMapMax")]
        pub gainmap_max: f64,

        #[serde(rename = "@HDRCapacityMin")]
        pub hdr_capacity_min: f64,

        #[serde(rename = "@HDRCapacityMax")]
        pub hdr_capacity_max: f64,

        #[serde(rename = "@OffsetSDR")]
        pub offset_sdr: f64,

        #[serde(rename = "@OffsetHDR")]
        pub offset_hdr: f64,
    }
}

pub mod primary {
    use serde::Deserialize;

    #[derive(Deserialize, Debug)]
    pub struct Xmp {
        #[serde(rename = "RDF")]
        pub rdf: Rdf,
    }

    #[derive(Deserialize, Debug)]
    pub struct Rdf {
        #[serde(rename = "Description")]
        pub description: Description,
    }

    #[derive(Deserialize, Debug)]
    pub struct Description {
        #[serde(rename = "@Version")]
        pub version: String,

        #[serde(rename = "Directory")]
        pub directory: Directory,
    }

    #[derive(Deserialize, Debug)]
    pub struct Directory {
        #[serde(rename = "Seq")]
        pub seq: Seq,
    }


    #[derive(Deserialize, Debug)]
    pub struct Seq {
        #[serde(rename = "li")]
        pub li: Vec<Li>,
    }

    #[derive(Deserialize, Debug)]
    pub struct Li {
        #[serde(rename = "Item")]
        pub item: ListItem,
    }

    #[derive(Deserialize, Debug)]
    pub struct ListItem {
        #[serde(rename = "@Semantic")]
        pub semantic: Semantic,

        #[serde(rename = "@Mime")]
        pub mime: String,
    }

    #[derive(Deserialize, Debug, Eq, PartialEq)]
    pub enum Semantic {
        Primary,
        GainMap,
    }
}

#[cfg(test)]
mod test {
    use crate::xmp::{parse_container, parse_gainmap};
    use crate::xmp::primary::Semantic;

    #[test]
    fn test_parse_container() {
        const XML: &str = r#"
            <x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.0-jc003">
              <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
                <rdf:Description rdf:about=""
                    xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"
                    xmlns:xmpNote="http://ns.adobe.com/xmp/note/"
                    xmlns:Container="http://ns.google.com/photos/1.0/container/"
                    xmlns:Item="http://ns.google.com/photos/1.0/container/item/"
                  hdrgm:Version="1.0"
                  xmpNote:HasExtendedXMP="6987B02A234BC7BEFADACC03DF1742E1">
                  <Container:Directory>
                    <rdf:Seq>
                      <rdf:li rdf:parseType="Resource">
                        <Container:Item
                          Item:Mime="image/jpeg"
                          Item:Semantic="Primary"/>
                      </rdf:li>
                      <rdf:li rdf:parseType="Resource">
                        <Container:Item
                          Item:Semantic="GainMap"
                          Item:Mime="image/jpeg"
                          Item:Length="33617"/>
                      </rdf:li>
                    </rdf:Seq>
                  </Container:Directory>
                </rdf:Description>
              </rdf:RDF>
            </x:xmpmeta>
        "#;

        let container = parse_container(XML).expect("parse container");
        assert_eq!(container.rdf.description.version, "1.0");
        assert_eq!(container.rdf.description.directory.seq.li.len(), 2);
        assert_eq!(container.rdf.description.directory.seq.li[0].item.semantic, Semantic::Primary);
        assert_eq!(container.rdf.description.directory.seq.li[1].item.semantic, Semantic::GainMap);
    }


    #[test]
    fn test_parse_gainmap() {
        const XML: &str = r#"
            <?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
            <x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 5.5.0">
             <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
              <rdf:Description rdf:about=""
                xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"
               hdrgm:Version="1.0"
               hdrgm:GainMapMin="0.000000"
               hdrgm:GainMapMax="2.524697"
               hdrgm:HDRCapacityMin="0.000000"
               hdrgm:HDRCapacityMax="2.524697"
               hdrgm:OffsetSDR="0.000000"
               hdrgm:OffsetHDR="0.000000"/>
             </rdf:RDF>
            </x:xmpmeta>

            <?xpacket end="w"?>
        "#;

        let container = parse_gainmap(XML).expect("parse gainmap");
        assert_eq!(container.rdf.description.version, "1.0");
        assert_eq!(container.rdf.description.gainmap_max, 2.524697);
        assert_eq!(container.rdf.description.gainmap_min, 0.0);
    }
}
