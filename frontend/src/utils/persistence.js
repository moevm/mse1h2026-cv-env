import { openDB } from 'idb';

const DB_NAME = 'ImageLabelingPlatform';
const STORE_NAME = 'collections';

export async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function saveCollections(collections) {
  const db = await getDB();
  await db.put(STORE_NAME, collections, 'state');
}

export async function loadCollections() {
  const db = await getDB();
  return await db.get(STORE_NAME, 'state') || [];
}