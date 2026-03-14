import { ApiType, shopifyApiProject } from '@shopify/api-codegen-preset';

export default {
  schema: 'https://quickstart-54a53934.myshopify.com/admin/api/2023-10/graphql.json',
  documents: ['*.ts', '!node_modules'],
  projects: {
    default: shopifyApiProject({
      apiType: ApiType.Admin,
      apiVersion: '2023-10',
      outputDir: './src/types',
    }),
  },
};
