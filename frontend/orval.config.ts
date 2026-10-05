import { defineConfig } from 'orval';

/*
  The web client of the API, generated from the v2 contract (D11).

  Plain typed `fetch` functions and the schema types, nothing else: the React
  Query hooks stay hand-written in each feature's `api/`, so cache keys and
  invalidation stay explicit. Every request goes through `apiRequest`
  (shared/api/api-client.ts): session, refresh-and-retry and the error envelope live
  in one place.

  The output is committed and never edited by hand. CI regenerates it and fails
  if it differs (CONTRIBUTING, "API client").
*/
export default defineConfig({
  coco: {
    input: { target: '../api/openapi.v2.json' },
    output: {
      mode: 'tags-split',
      target: 'src/shared/api/generated/endpoints.ts',
      schemas: 'src/shared/api/generated/model',
      client: 'fetch',
      clean: true,
      override: {
        mutator: { path: 'src/shared/api/api-client.ts', name: 'apiRequest' },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
});
