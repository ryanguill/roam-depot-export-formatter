# To develop

`npm ci && npm run dev` will create a webpack server watching `src/`

- Then go into a roam graph
- , go to settings
- , Roam Depot
- , click the cog next to installed extensions and enable developer mode
- then click the folder next to developer extensions and select this root directory.

While you are developing you can then use ctrl-d,r to reload the extension.

Things to keep in mind:

Everything you load you need to unload. Any DOM you create you need to destroy. If you listen on events that don't get destroyed when you remove the DOM you need to remove them manually.

## References:

- Roam Depot Developer documentation: https://roamresearch.com/#/app/developer-documentation/page/5BB8h4I7b
  - Extension API https://roamresearch.com/#/app/developer-documentation/page/y31lhjIqU
  - roamAlphaAPI https://roamresearch.com/#/app/developer-documentation/page/tIaOPdXCj
- Roam Depot github: https://github.com/Roam-Research/roam-depot
- RoamJS Workbench (inspiration, great examples of functionality and utility (Thank you dvargas92495 and TfTHacker)): https://github.com/dvargas92495/roamjs-workbench
