export type ProductImageFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
};

export type StoredProductImage = {
  key: string;
  url: string;
};

export abstract class StorageProvider {
  abstract putProductImage(file: ProductImageFile): Promise<StoredProductImage>;
}
