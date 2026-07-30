import { type NormalizedProductImage } from './image-validator';

export type StoredProductImage = {
  key: string;
  url: string;
};

export abstract class StorageProvider {
  abstract putProductImage(
    image: NormalizedProductImage,
  ): Promise<StoredProductImage>;
}
