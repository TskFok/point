const SAFE_IMAGE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function productImageUrl(imageKey: string) {
  const segments = imageKey.split("/");
  if (
    segments.length < 2 ||
    segments.some(
      (segment) =>
        !SAFE_IMAGE_SEGMENT.test(segment) ||
        segment === "." ||
        segment === "..",
    )
  ) {
    return "/file.svg";
  }

  return `/uploads/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}
