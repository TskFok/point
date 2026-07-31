const PRODUCT_IMAGE_KEY_PATTERN =
  /^products\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

export function productImageUrl(imageKey: string) {
  if (!PRODUCT_IMAGE_KEY_PATTERN.test(imageKey)) {
    return "/file.svg";
  }

  return `/uploads/${imageKey}`;
}
