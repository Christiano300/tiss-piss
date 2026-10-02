import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  webExt: {
    startUrls: ["https://tiss.tuwien.ac.at/"]
  },
  manifest: ({browser}) => ({
    permissions: browser === "chrome" ? ['favicon', 'storage'] : ['storage'],
    browser_specific_settings: {
      gecko: {
        id: "tiss-piss@patzl.dev",
        data_collection_permissions: {
          required: [
            "none"
          ]
        }
      }
    }
  })
});
