import type {Album} from './gallery-client.service';

export type AlbumTree = {
  // name of the current tree (often last segment of 'path')
  name: string,
  // the parent of this AlbumTree
  parent: AlbumTree | null,
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
  let root = emptyAlbumTree('root');

  for (const album of albums) {
    // remove last component, as that is the album itself
    const path = album.relpathSegments.slice(0, album.relpathSegments.length - 1);

    // add album to node that is supposed to contain this album
    const node = byPath(root, path);
    node.albums.push(album);

    incrementAlbumCount(root, path, album);
  }

  // remove empty prefix directories as long as they contain only one child node
  while (root.albums.length === 0 && root.children.size === 1) {
    root = [...root.children.values()][0]
    root.parent = null;
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
        parent: node,
      }

      node.children.set(seg, child);
    }

    // continue with the child as the current node
    node = child;
  }

  return node;
}

export function pathOf(node: AlbumTree): string[] {
  const path: string[] = [];

  while (true) {
    if (node.parent == null) {
      return path.reverse()
    }

    path.push(node.name);
    node = node.parent
  }
}

function emptyAlbumTree(name: string): AlbumTree {
  return {
    name,
    parent: null,
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


