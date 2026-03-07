# Roam Depot: Export Formatter

Adds a context menu option to export the selected node with various formatting options, such as removing roam specific syntax, making it suitable to share in emails, slack or other places. A port of my previous project: https://roam-tools.ryanguill.com / https://github.com/ryanguill/roam-tools

To use the formatter UI: select a node in your graph, right click and choose `Plugins -> Export` (or run `Export` from the command palette).

Additional references export commands:

- Block context menu: `Export with References`
- Command palette: `Export with References` (focused block first, otherwise current page)
- Command palette: `Export Page with References` (always exports current page + backlinks)

These copy markdown directly to your clipboard, including backlink blocks grouped by source page.

Inside the Export Formatter modal, you can also enable `Include backlinks` and choose scope (`Selected block/page` or `Containing page`) to include references directly in the formatted output.

For Word/Google Docs (or other document editors), use the **word/doc export (keeps hierarchy)** section and click **[copy rich]** to preserve nested list levels. The plain output copy button is text-only.

<img src="https://raw.githubusercontent.com/ryanguill/roam-depot-export-formatter/main/readme_assets/how-to-use-1.png" title="How to open the formatter" alt="How to open the formatter" />

<img src="https://raw.githubusercontent.com/ryanguill/roam-depot-export-formatter/main/readme_assets/how-to-use-2.png" title="Formatter panel example" alt="Formatter panel example" />

Issues and PRs welcome: https://github.com/ryanguill/roam-depot-export-formatter/issues
