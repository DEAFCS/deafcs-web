export default defineEventHandler((event) => {
  if (!isNuxtDirectoryPath(getRequestURL(event).pathname)) {
    return;
  }

  throw createError({
    statusCode: 404,
    statusMessage: "Not Found",
  });
});
