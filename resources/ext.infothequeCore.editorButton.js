/**
 * Adds a single "+ Ajouter un modèle Infothèque" button next to the
 * source-mode edit textarea (#wpTextbox1). Clicking it reveals a small
 * column menu with the 4 assistant forms; picking one opens a self-built
 * overlay (same DOM-injection pattern as the existing "+ Ajouter un
 * téléchargement" gadget in MediaWiki:Common.js — full-screen dim
 * background + centered box, no iframe, no popup window) with a form
 * generated from the schema exported server-side as mw.config's
 * ithcSchemas (see SchemaExporter/Hooks::onEditPageShowEditFormInitial).
 *
 * All business logic (field conventions, escaping, validation, existing
 * block parsing) stays server-side, called via the action=infothequecore
 * API module (mw.Api, not a SpecialPage — no skin rendering involved, so
 * none of the X-Frame-Options/HTMLForm issues that blocked the previous
 * approach apply here). This module only renders the form generically
 * from the schema data and, on completion, splices the result into the
 * textarea — nothing is ever saved to the wiki from here; the user
 * reviews and saves the page themselves.
 *
 * Detection of an "existing table to edit" is scoped to whichever
 * {{TemplateName...}} block (if any) the cursor is currently inside, not
 * just the first one found on the page — several forms share the same
 * underlying template (Téléchargements logiciels/jeux and Manuels both
 * call {{Téléchargements}}), so a page can legitimately contain more than
 * one call to it.
 */
( function () {
	'use strict';

	var SCHEMA_IDS = [ 'telechargements-logiciels', 'manuels', 'configurations', 'pilotes' ];
	var api = new mw.Api();
	var currentOverlay = null;
	var fieldIdCounter = 0;

	function init() {
		var textarea = document.getElementById( 'wpTextbox1' );
		var schemas = mw.config.get( 'ithcSchemas' );
		if ( !textarea || !schemas ) {
			return; // not in source editing mode, or schema export missing
		}
		addTrigger( textarea, schemas );
	}

	// ---- Trigger button + dropdown ----------------------------------------

	function addTrigger( textarea, schemas ) {
		var trigger = document.createElement( 'button' );
		trigger.type = 'button';
		trigger.className = 'ithc-editor-btn';
		trigger.textContent = mw.msg( 'infothequecore-editor-trigger' );
		trigger.style.marginBottom = '10px';

		// Appended to <body> and positioned in JS (not CSS position:absolute
		// under the button) because this skin has an ancestor that creates a
		// new containing block, which made position:absolute render the menu
		// far from the button instead of right under it.
		var dropdown = document.createElement( 'div' );
		dropdown.className = 'ithc-dropdown';
		dropdown.hidden = true;
		document.body.appendChild( dropdown );

		SCHEMA_IDS.forEach( function ( id ) {
			var schema = schemas[ id ];
			if ( !schema ) {
				return;
			}
			var item = document.createElement( 'button' );
			item.type = 'button';
			item.className = 'ithc-dropdown-item';
			item.textContent = schema.label;
			item.addEventListener( 'click', function () {
				dropdown.hidden = true;
				openAssistant( textarea, schema );
			} );
			dropdown.appendChild( item );
		} );

		trigger.addEventListener( 'click', function ( e ) {
			e.stopPropagation();
			if ( dropdown.hidden ) {
				var rect = trigger.getBoundingClientRect();
				dropdown.style.top = ( rect.bottom + window.scrollY ) + 'px';
				dropdown.style.left = ( rect.left + window.scrollX ) + 'px';
			}
			dropdown.hidden = !dropdown.hidden;
		} );
		document.addEventListener( 'click', function ( e ) {
			if ( e.target !== trigger && !dropdown.contains( e.target ) ) {
				dropdown.hidden = true;
			}
		} );
		window.addEventListener( 'scroll', function () {
			dropdown.hidden = true;
		}, true );

		textarea.parentNode.insertBefore( trigger, textarea );
	}

	// ---- Existing-block detection (textarea, unrelated to the overlay) ----

	/** Depth-counts {{ }} from startIdx, returns the index of the matching closing "}}", or -1. */
	function matchClosingBraces( text, startIdx ) {
		var depth = 0;
		for ( var i = startIdx; i < text.length - 1; i++ ) {
			if ( text[ i ] === '{' && text[ i + 1 ] === '{' ) {
				depth++;
				i++;
			} else if ( text[ i ] === '}' && text[ i + 1 ] === '}' ) {
				depth--;
				i++;
				if ( depth === 0 ) {
					return i;
				}
			}
		}
		return -1;
	}

	/** Finds the {{templateName...}} call, among possibly several, that contains cursorPos. */
	function findEnclosingBlock( text, templateName, cursorPos ) {
		var needle = '{{' + templateName;
		var searchFrom = 0;
		var idx;
		while ( ( idx = text.indexOf( needle, searchFrom ) ) !== -1 ) {
			var end = matchClosingBraces( text, idx );
			if ( end !== -1 && cursorPos >= idx && cursorPos <= end ) {
				return { start: idx, end: end, raw: text.slice( idx, end + 1 ) };
			}
			searchFrom = idx + needle.length;
		}
		return null;
	}

	// ---- Opening the assistant ---------------------------------------------

	function openAssistant( textarea, schema ) {
		if ( currentOverlay ) {
			return; // one at a time
		}

		var cursorPos = textarea.selectionStart || 0;
		var block = findEnclosingBlock( textarea.value, schema.templateName, cursorPos );
		var pendingBlock = block ? { start: block.start, end: block.end } : null;

		if ( !block ) {
			buildOverlay( schema, textarea, pendingBlock, {}, [ {} ] );
			return;
		}

		buildOverlay( schema, textarea, pendingBlock, {}, [ {} ], true );
		api.post( {
			action: 'infothequecore',
			op: 'parseexisting',
			schema: schema.id,
			raw: block.raw,
			formatversion: 2
		} ).done( function ( data ) {
			var rows = ( data.rows && data.rows.length ) ? data.rows : [ {} ];
			buildOverlay( schema, textarea, pendingBlock, data.title || {}, rows );
		} ).fail( function () {
			buildOverlay( schema, textarea, pendingBlock, {}, [ {} ] );
		} );
	}

	// ---- Overlay construction ----------------------------------------------

	function closeOverlay() {
		if ( currentOverlay ) {
			currentOverlay.remove();
			currentOverlay = null;
		}
	}

	/**
	 * (Re)builds the overlay for the given schema. Called once immediately
	 * (loading=true) while an existing block is being fetched/parsed, then
	 * again with the real pre-filled data once that resolves.
	 */
	function buildOverlay( schema, textarea, pendingBlock, titleValues, rowsValues, loading ) {
		closeOverlay();

		var overlay = document.createElement( 'div' );
		overlay.className = 'ithc-form-overlay';
		overlay.addEventListener( 'click', function ( e ) {
			if ( e.target === overlay ) {
				closeOverlay();
			}
		} );

		var modal = document.createElement( 'div' );
		modal.className = 'ithc-form-modal';
		overlay.appendChild( modal );

		var closeBtn = document.createElement( 'button' );
		closeBtn.type = 'button';
		closeBtn.className = 'ithc-form-modal-close';
		closeBtn.textContent = '×';
		closeBtn.addEventListener( 'click', closeOverlay );
		modal.appendChild( closeBtn );

		var heading = document.createElement( 'h3' );
		heading.textContent = schema.label;
		modal.appendChild( heading );

		if ( loading ) {
			var loadingEl = document.createElement( 'p' );
			loadingEl.className = 'ithc-loading';
			loadingEl.textContent = mw.msg( 'infothequecore-loading-existing' );
			modal.appendChild( loadingEl );
			document.body.appendChild( overlay );
			currentOverlay = overlay;
			return;
		}

		var titleContainer = document.createElement( 'div' );
		titleContainer.className = 'ithc-title-fields';
		schema.titleFields.forEach( function ( field ) {
			titleContainer.appendChild( renderField( field, titleValues[ field.key ] ) );
		} );
		modal.appendChild( titleContainer );

		var rowsContainer = document.createElement( 'div' );
		rowsContainer.className = 'ithc-rows';
		rowsValues.forEach( function ( rowVals ) {
			rowsContainer.appendChild( renderRow( schema, rowVals ) );
		} );
		modal.appendChild( rowsContainer );

		var addRowBtn = document.createElement( 'button' );
		addRowBtn.type = 'button';
		addRowBtn.className = 'ithc-add-row-btn';
		addRowBtn.textContent = mw.msg( 'infothequecore-add-row' );
		addRowBtn.addEventListener( 'click', function () {
			rowsContainer.appendChild( renderRow( schema, {} ) );
		} );
		modal.appendChild( addRowBtn );

		var errorsEl = document.createElement( 'ul' );
		errorsEl.className = 'ithc-form-errors';
		errorsEl.hidden = true;
		modal.appendChild( errorsEl );

		var previewSection = document.createElement( 'div' );
		previewSection.className = 'ithc-form-preview';
		previewSection.hidden = true;
		modal.appendChild( previewSection );

		var actions = document.createElement( 'div' );
		actions.className = 'ithc-form-actions';
		var previewBtn = document.createElement( 'button' );
		previewBtn.type = 'button';
		previewBtn.className = 'ithc-btn-primary';
		previewBtn.textContent = mw.msg( 'infothequecore-preview-button' );
		previewBtn.addEventListener( 'click', function () {
			doPreview( schema, textarea, pendingBlock, titleContainer, rowsContainer, errorsEl, previewSection );
		} );
		actions.appendChild( previewBtn );
		modal.appendChild( actions );

		document.body.appendChild( overlay );
		currentOverlay = overlay;
	}

	// ---- Field / row rendering ----------------------------------------------

	function renderField( field, value ) {
		var wrapper = document.createElement( 'div' );
		wrapper.className = 'ithc-field';

		var label = document.createElement( 'label' );
		label.className = 'ithc-field-label';
		label.appendChild( document.createTextNode( field.label + ( field.required ? ' *' : '' ) ) );
		wrapper.appendChild( label );

		var input;
		if ( field.widget === 'textarea' ) {
			input = document.createElement( 'textarea' );
			input.rows = 3;
		} else {
			input = document.createElement( 'input' );
			input.type = 'text';
			if ( field.widget === 'combobox' && field.suggestedValues && field.suggestedValues.length ) {
				var listId = 'ithc-datalist-' + ( fieldIdCounter++ );
				var datalist = document.createElement( 'datalist' );
				datalist.id = listId;
				field.suggestedValues.forEach( function ( v ) {
					var opt = document.createElement( 'option' );
					opt.value = v;
					datalist.appendChild( opt );
				} );
				wrapper.appendChild( datalist );
				input.setAttribute( 'list', listId );
			}
		}
		input.className = 'ithc-field-input';
		if ( field.example ) {
			input.placeholder = field.example;
		}
		input.value = value || '';
		label.appendChild( input );

		if ( field.help ) {
			var help = document.createElement( 'p' );
			help.className = 'ithc-field-help';
			help.textContent = field.help;
			wrapper.appendChild( help );
		}

		wrapper.ithcFieldKey = field.key;
		wrapper.ithcGetValue = function () {
			return input.value;
		};
		return wrapper;
	}

	function renderRow( schema, rowValues ) {
		var row = document.createElement( 'div' );
		row.className = 'ithc-row';

		var removeBtn = document.createElement( 'button' );
		removeBtn.type = 'button';
		removeBtn.className = 'ithc-row-remove';
		removeBtn.textContent = '×';
		removeBtn.title = mw.msg( 'infothequecore-remove-row' );
		removeBtn.addEventListener( 'click', function () {
			row.remove();
		} );
		row.appendChild( removeBtn );

		schema.rowFields.forEach( function ( field ) {
			row.appendChild( renderField( field, rowValues ? rowValues[ field.key ] : '' ) );
		} );

		return row;
	}

	function collectFields( container ) {
		var values = {};
		Array.prototype.forEach.call( container.querySelectorAll( '.ithc-field' ), function ( fieldEl ) {
			values[ fieldEl.ithcFieldKey ] = fieldEl.ithcGetValue();
		} );
		return values;
	}

	function collectRows( rowsContainer ) {
		return Array.prototype.map.call( rowsContainer.querySelectorAll( '.ithc-row' ), collectFields );
	}

	// ---- Preview / insert ----------------------------------------------------

	function showErrors( errorsEl, messages ) {
		errorsEl.innerHTML = '';
		messages.forEach( function ( msg ) {
			var li = document.createElement( 'li' );
			li.textContent = msg;
			errorsEl.appendChild( li );
		} );
		errorsEl.hidden = false;
	}

	function extractApiError( code, err ) {
		if ( err && err.error && err.error.info ) {
			return err.error.info;
		}
		return String( code );
	}

	function doPreview( schema, textarea, pendingBlock, titleContainer, rowsContainer, errorsEl, previewSection ) {
		var titleValues = collectFields( titleContainer );
		var rowsValues = collectRows( rowsContainer );

		errorsEl.hidden = true;
		previewSection.hidden = true;
		previewSection.innerHTML = '';

		api.post( {
			action: 'infothequecore',
			op: 'generate',
			schema: schema.id,
			title: JSON.stringify( titleValues ),
			rows: JSON.stringify( rowsValues ),
			formatversion: 2
		} ).done( function ( data ) {
			if ( data.errors && data.errors.length ) {
				showErrors( errorsEl, data.errors );
				return;
			}
			renderPreview( textarea, pendingBlock, previewSection, data.wikitext );
		} ).fail( function ( code, err ) {
			showErrors( errorsEl, [ extractApiError( code, err ) ] );
		} );
	}

	function renderPreview( textarea, pendingBlock, previewSection, wikitext ) {
		api.post( {
			action: 'parse',
			text: wikitext,
			title: mw.config.get( 'wgPageName' ),
			prop: 'text',
			disablelimitreport: 1,
			contentmodel: 'wikitext',
			formatversion: 2
		} ).done( function ( data ) {
			previewSection.innerHTML = '';
			previewSection.hidden = false;

			var renderedHeading = document.createElement( 'h4' );
			renderedHeading.textContent = mw.msg( 'infothequecore-preview-heading' );
			previewSection.appendChild( renderedHeading );

			var rendered = document.createElement( 'div' );
			rendered.className = 'ithc-preview-rendered';
			rendered.innerHTML = data.parse.text;
			previewSection.appendChild( rendered );

			var wikitextHeading = document.createElement( 'h4' );
			wikitextHeading.textContent = mw.msg( 'infothequecore-preview-wikitext-heading' );
			previewSection.appendChild( wikitextHeading );

			var raw = document.createElement( 'pre' );
			raw.className = 'ithc-preview-wikitext';
			raw.textContent = wikitext;
			previewSection.appendChild( raw );

			var insertBtn = document.createElement( 'button' );
			insertBtn.type = 'button';
			insertBtn.className = 'ithc-btn-primary';
			insertBtn.textContent = mw.msg( 'infothequecore-insert-button' );
			insertBtn.addEventListener( 'click', function () {
				applyResult( textarea, pendingBlock, wikitext );
				closeOverlay();
			} );
			previewSection.appendChild( insertBtn );
		} ).fail( function () {
			previewSection.hidden = false;
			previewSection.textContent = mw.msg( 'infothequecore-preview-failed' );
		} );
	}

	function applyResult( textarea, pendingBlock, wikitext ) {
		if ( pendingBlock ) {
			var current = textarea.value;
			textarea.value = current.slice( 0, pendingBlock.start ) + wikitext + current.slice( pendingBlock.end + 1 );
		} else {
			var start = textarea.selectionStart || 0;
			var end = textarea.selectionEnd || 0;
			textarea.value = textarea.value.slice( 0, start ) + wikitext + textarea.value.slice( end );
		}
		textarea.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		textarea.focus();
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
}() );
