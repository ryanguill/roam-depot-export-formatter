import { htmlToElement } from "./utils";

const html = `
<div id="rgef_modal" class="rgef_modal rgef-dom">
	<div class="rgef_modal-content">
	  <textarea style="display:none;" id="rgef_input"></textarea>
	  <div class="rgef_modal-topbar">
		<header class="rgef_modal-title">Export Formatter</header>
		<button type="button" class="rgef_close" aria-label="Close Export Formatter">&times;</button>
	  </div>
	  <div class="rgef_parent">
		<div class="rgef_settings-container rgef_container container">
		  <div class="rgef_container-label">Settings
		  	<button type="button" class="rgef_reset-options rgef_reset-link">clear</button>
		  </div>
		  <form id="rgef_settings-form">
			<div class="rgef_setting">
			  <label
				class="bp3-control bp3-switch bp3-align-right"
				title="shows rendered markdown preview in the Rendered section"
			  >
				Rendered preview
				<input type="checkbox" id="rgef_enable_rendered_preview" data-default="true" checked />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
		  	<div class="rgef_setting">
			  <label
				class="bp3-control bp3-switch bp3-align-right"
				title="removes the selected block (top line) from the output"
			  >
				Remove parent node
				<input type="checkbox" id="rgef_ignore_parent_node" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting rgef_setting--select">
			  <label title="removes indentation at the beginning of lines">Indentation</label>
			  <span class="bp3-html-select bp3-small">
				<select id="rgef_flatten_indentation" data-default="0">
				  <option value="0">None</option>
				  <option value="999">All</option>
				  <option value="1">1 Level</option>
				  <option value="2">2 Levels</option>
				  <option value="3">3 Levels</option>
				</select>
			  </span>
			</div>
				<div class="rgef_setting">
				  <label
					class="bp3-control bp3-switch bp3-align-right"
					title="removes bullets at the beginning of lines"
				  >
					Bullets <code>&#8226;</code>
					<input type="checkbox" id="rgef_remove_bullets" data-default="false" />
					<span class="bp3-control-indicator"></span>
				  </label>
				</div>
				<div class="rgef_setting">
				  <label
					class="bp3-control bp3-switch bp3-align-right"
					title="removes brackets and markdown aliases for pages"
				  >
					Brackets <code>[[ ]]</code>
					<input type="checkbox" id="rgef_remove_double_brackets" data-default="false" />
					<span class="bp3-control-indicator"></span>
				  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="bp3-control bp3-switch bp3-align-right"
				title="removes namespaces from links"
			  >
				Namespaces <code>my/name</code>
				<input type="checkbox" id="rgef_remove_namespaces" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label class="bp3-control bp3-switch bp3-align-right" title="removes braces">
				Braces <code>{{ }}</code>
				<input type="checkbox" id="rgef_remove_double_braces" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="bp3-control bp3-switch bp3-align-right"
				title="removes bold, italic and highlighting markdown"
			  >
				Formatting <code>** __ ^^ ~~</code>
				<input type="checkbox" id="rgef_remove_formatting" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="bp3-control bp3-switch bp3-align-right"
				title="removes callout markers like [[>]] [[!NOTE]]"
			  >
				Callout <code>[[&gt;]]</code>
				<input type="checkbox" id="rgef_remove_callouts" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="bp3-control bp3-switch bp3-align-right"
				title="removes fenced code blocks"
			  >
				Code <code>\`\`\`</code>
				<input type="checkbox" id="rgef_remove_code_blocks" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting rgef_setting--select">
			  <label title="adds extra line breaks between blocks">Line breaks</label>
			  <span class="bp3-html-select bp3-small">
				<select id="rgef_add_line_breaks" data-default="0">
				  <option value="0">None</option>
				  <option value="1">1 Line</option>
				  <option value="2">2 Lines</option>
				</select>
			  </span>
			</div>
			<div class="rgef_setting rgef_setting--select">
			  <label title="Where extra line breaks are inserted">Breaks apply to</label>
			  <span class="bp3-html-select bp3-small">
				<select id="rgef_line_breaks_before_all_nodes" data-default="false">
				  <option value="false">Paragraphs</option>
				  <option value="true">All Nodes</option>
				</select>
			  </span>
			</div>
			<div class="rgef_setting">
			  <label class="bp3-control bp3-switch bp3-align-right" title="turns attributes:: into attributes:">
				Extra colon <code>::</code>
				<input type="checkbox" id="rgef_remove_colon_from_attributes" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label class="bp3-control bp3-switch bp3-align-right" title="remove quotes">
				Quotes <code>&quot;</code> <code>&gt;</code>
				<input type="checkbox" id="rgef_remove_quotes" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label class="bp3-control bp3-switch bp3-align-right" title="remove hashtag marks">
				Hashtags <code>#</code>
				<input type="checkbox" id="rgef_remove_hashtag_marks" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label class="bp3-control bp3-switch bp3-align-right" title="remove todo and dones">
				TODO &amp; DONE
				<input type="checkbox" id="rgef_remove_todos" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="bp3-control bp3-switch bp3-align-right"
				title="removes blocks with queries"
			  >
				Queries
				<input type="checkbox" id="rgef_remove_blocks_with_queries" data-default="false" />
				<span class="bp3-control-indicator"></span>
			  </label>
			</div>
		  </form>
		</div>

		<div class="rgef_output-container rgef_container">
		  <div class="rgef_container-label">Markdown
		  	<button type="button" class="bp3-button bp3-minimal bp3-small dont-focus-block rgef_copy_button" id="rgef_copy_output">
				<span class="bp3-icon bp3-icon-duplicate" aria-hidden="true"></span>
				<span class="rgef_copy_label">Copy</span>
			</button>
		  </div>
		  <div class="rgef_output-hint">Temporary edits affect export only</div>
		  <div class="rgef_output-textarea-container">
			<textarea id="rgef_output" name="output"></textarea>
		  </div>
		</div>
		<div class="rgef_rendered-container rgef_container">
		  <div class="rgef_container-label">Rendered
			<div class="rgef_rendered-actions">
			  <span class="bp3-html-select bp3-small">
				<select id="rgef_render_target" data-default="whatsapp"></select>
			  </span>
			  <button type="button" class="bp3-button bp3-minimal bp3-small dont-focus-block rgef_copy_button" id="rgef_copy_rendered">
				  <span class="bp3-icon bp3-icon-duplicate" aria-hidden="true"></span>
				  <span class="rgef_copy_label">Copy</span>
			  </button>
			</div>
		  </div>
		  <div id="rgef_render_target_hint" class="rgef_output-hint rgef_render-target-hint"></div>
		  <div id="rgef_rendered-output"></div>
		</div>
	  </div>
	</div>
</div>
`;

export function setupDOM() {
	document.getElementsByTagName("body")[0].appendChild(htmlToElement(html));
}

export function cleanupDOM() {
	document.querySelectorAll(".rgef-dom").forEach((e) => e.remove());
}
