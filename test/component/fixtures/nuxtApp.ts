// Resolution target for Nuxt's virtual "#app" module in component specs
// (see vitest.config.ts). Specs that use it replace it with vi.mock("#app").
export const useRoute = () => ({ params: {}, query: {} });
export const useRouter = () => ({
  resolve: () => ({ href: "" }),
  push: () => {},
});
