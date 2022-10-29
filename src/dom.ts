import { htmlToElement } from "./utils";

const html = `
<div id="rgef_modal" class="rgef_modal rgef-dom">

<div class="rgef_modal-content">
  <textarea style="display:none;" id="rgef_input"></textarea>
  <span class="rgef_close">&times;</span>
	<div class="rgef_parent">
		<div class="rgef_header-container">
			<header>
				Export Formatter
			</header>
		</div>
		<div class="rgef_settings-container container">
		  <div class="rgef_container-label">settings </div>
		  <a class="rgef_reset-options styled">⤬ clear</a>
		  <form id="rgef_settings-form">
		  	<div class="rgef_setting">
			  <label
				class="rgef_toggle-on-click"
				title="removes the top line from the output"
			  >
				ignore parent node?
				<select id="rgef_ignore_parent_node" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="rgef_toggle-on-click"
				title="removes indentiation at the beginning of lines"
			  >
				flatten indentation?
				<select id="rgef_flatten_indentation" class="rgef_hidden-select-setting" data-default="0">
				  <option value="0">No</option>
				  <option value="999">All</option>
				  <option value="1">One</option>
				  <option value="2">Two</option>
				  <option value="3">Three</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="rgef_toggle-on-click"
				title="removes bullets at the beginning of lines"
			  >
				remove bullets?
				<select id="rgef_remove_bullets" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="rgef_toggle-on-click"
				title="removes brackets, and markdown aliases for pages"
			  >
				remove [[brackets]]?
				<select id="rgef_remove_double_brackets" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="rgef_toggle-on-click"
				title="removes namespaces from links"
			  >
				remove namespaces?
				<select id="rgef_remove_namespaces" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label class="rgef_toggle-on-click" title="removes braces">
				remove {{braces}}?
				<select id="rgef_remove_double_braces" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="rgef_toggle-on-click"
				title="removes bold, italic and highlighting markdown"
			  >
				remove formatting?
				<select id="rgef_remove_formatting" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting zero">
			  <label class="rgef_toggle-on-click" title="adds an extra line break">
				add line breaks before paragraphs?
				<select id="rgef_add_line_breaks" class="rgef_hidden-select-setting" data-default="0">
				  <option value="0">Zero</option>
				  <option value="1">One</option>
				  <option value="2">Two</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label class="rgef_toggle-on-click" title="turns attributes:: into attributes:">
				remove extra colon from attributes::?
				<select id="rgef_remove_colon_from_attributes" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label class="rgef_toggle-on-click" title="remove quotes">
				remove quote marks?
				<select id="rgef_remove_quotes" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label class="rgef_toggle-on-click" title="remove hashtag marks">
				remove #'s?
				<select id="rgef_remove_hashtag_marks" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label class="rgef_toggle-on-click" title="remove todo and dones">
				remove todo &amp; done's?
				<select id="rgef_remove_todos" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
			<div class="rgef_setting">
			  <label
				class="rgef_toggle-on-click"
				title="removes blocks with queries"
			  >
				remove queries?
				<select id="rgef_remove_blocks_with_queries" class="rgef_hidden-select-setting" data-default="false">
				  <option value="false">No</option>
				  <option value="true">Yes</option>
				</select>
			  </label>
			</div>
		  </form>
		</div>
		
		<div class="rgef_output-container rgef_container">
		  <div class="rgef_container-label">output 
		  	<span class="bp3-button bp3-minimal bp3-small dont-focus-block rgef_copy_button" id="rgef_copy_output">
				<span class="bp3-icon bp3-icon-clipboard"></span>
			</span>
		  </div>
		  <div class="rgef_output-textarea-container">
			<textarea id="rgef_output" name="output"></textarea>
			
		  </div>
		</div>
		<div class="rgef_rendered-container rgef_container">
		  <div class="rgef_container-label">rendered markdown</div>
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
