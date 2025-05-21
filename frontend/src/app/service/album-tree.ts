import type {Album} from './gallery-client.service';

export type AlbumTree = {
  // name of the current tree (often last segment of 'path')
  name: string,
  // path to the current tree
  path: string[],
  // albums in this node
  albums: Album[],
  // children by next segment
  children: Map<string, AlbumTree>,
  // all albums within this album tree. Has the same length as allAlbumCount
  allAlbums: Album[],
  // total number of albums in this node and all subnodes
  allAlbumCount: number,
}

export function buildAlbumTree(albums: Album[]): AlbumTree {
  const root = emptyAlbumTree('root');

  for (const album of albums) {
    // remove last component, as that is the album itself
    const path = album.relpathSegments.slice(0, album.relpathSegments.length - 1);

    // add album to node that is supposed to contain this album
    const node = byPath(root, path);
    node.albums.push(album);

    incrementAlbumCount(root, path, album);
  }

  return root
}

export function byPath(node: AlbumTree, path: string[]): AlbumTree {
  for (const seg of path) {
    let child = node.children.get(seg);
    if (child == null) {
      // next child does not exist, create it as a child of the current node
      child = {
        ...emptyAlbumTree(seg),
        path: [...node.path, seg],
      }

      node.children.set(seg, child);
    }

    // continue with the child as the current node
    node = child;
  }

  return node;
}

function emptyAlbumTree(name: string): AlbumTree {
  return {
    name,
    path: [],
    albums: [],
    children: new Map(),
    allAlbums: [],
    allAlbumCount: 0,
  }
}

function incrementAlbumCount(root: AlbumTree, path: string[], album: Album) {
  root.allAlbumCount += 1;
  root.allAlbums.push(album);

  let node: AlbumTree | undefined = root;

  for (const seg of path) {
    node = node.children.get(seg);
    if (node == null) {
      return;
    }

    node.allAlbumCount += 1
    node.allAlbums.push(album);
  }
}


