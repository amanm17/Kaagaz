import Dexie from 'dexie'
export const db=new Dexie('kaagaz-local-reading-desk')
db.version(1).stores({books:'id,name,fileHash,lastPage,lastBookmarkId,totalPages,createdAt,updatedAt',files:'bookId,blob,updatedAt',bookmarks:'++id,bookId,page,type,title,flowerPreset,createdAt,updatedAt,isLastActive',notes:'++id,bookId,page,bookmarkId,highlightId,content,createdAt,updatedAt',highlights:'++id,bookId,page,text,color,rects,createdAt,updatedAt',assets:'++id,bookId,bookmarkId,kind,blob,createdAt',settings:'key'})
db.version(2).stores({books:'id,name,fileHash,lastPage,lastBookmarkId,totalPages,createdAt,updatedAt',files:'bookId,blob,updatedAt',bookmarks:'++id,bookId,page,type,title,flowerPreset,createdAt,updatedAt,isLastActive',notes:'++id,bookId,page,bookmarkId,highlightId,content,createdAt,updatedAt',highlights:'++id,bookId,page,text,color,rects,createdAt,updatedAt',assets:'++id,bookId,bookmarkId,kind,blob,createdAt',settings:'key',bookSettings:'bookId'})
export async function saveSetting(key,value){await db.settings.put({key,value,updatedAt:Date.now()})}
export async function getSetting(key,fallback){const item=await db.settings.get(key);return item?.value??fallback}
export async function markLastBookmark(bookId,bookmarkId,page){const existing=await db.bookmarks.where('bookId').equals(bookId).toArray();await Promise.all(existing.map(b=>db.bookmarks.update(b.id,{isLastActive:b.id===bookmarkId})));await db.books.update(bookId,{lastBookmarkId:bookmarkId,lastPage:page,updatedAt:Date.now()})}


// Notebook feature stores
db.version(3).stores({
books:'id,name,fileHash,lastPage,lastBookmarkId,totalPages,createdAt,updatedAt',files:'bookId,blob,updatedAt',bookmarks:'++id,bookId,page,type,title,flowerPreset,createdAt,updatedAt,isLastActive',notes:'++id,bookId,page,bookmarkId,highlightId,content,createdAt,updatedAt',highlights:'++id,bookId,page,text,color,rects,createdAt,updatedAt',assets:'++id,bookId,bookmarkId,kind,blob,createdAt',settings:'key',
  notebooks: '++id, title, createdAt, updatedAt, lastOpenedPage, defaultPageType',
  notebookPages: '++id, [notebookId+pageNumber], notebookId, pageNumber, pageType, pageShade, updatedAt',
  notebookAssets: '++id, [notebookId+pageNumber], notebookId, pageNumber, type, updatedAt'
})
