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
 * The row form is a real <table> (column headers = field labels) so it
 * already looks like the wikitable/grid it will produce — no separate
 * "preview" step or raw wikitext shown. "Insérer dans l'éditeur" both
 * validates+generates (action=infothequecore&op=generate) and, on
 * success, splices the result into the textarea in one click; the API
 * call still runs server-side (single source of truth for escaping/
 * conventions), it's just not shown before inserting.
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

		var tableWrap = document.createElement( 'div' );
		tableWrap.className = 'ithc-rows-table-wrap';
		var table = document.createElement( 'table' );
		table.className = 'ithc-rows-table';
		table.appendChild( buildTableHead( schema ) );
		var tbody = document.createElement( 'tbody' );
		rowsValues.forEach( function ( rowVals ) {
			tbody.appendChild( buildRowTr( schema, rowVals ) );
		} );
		table.appendChild( tbody );
		tableWrap.appendChild( table );
		modal.appendChild( tableWrap );

		var addRowBtn = document.createElement( 'button' );
		addRowBtn.type = 'button';
		addRowBtn.className = 'ithc-add-row-btn';
		addRowBtn.textContent = mw.msg( 'infothequecore-add-row' );
		addRowBtn.addEventListener( 'click', function () {
			tbody.appendChild( buildRowTr( schema, {} ) );
		} );
		modal.appendChild( addRowBtn );

		var errorsEl = document.createElement( 'ul' );
		errorsEl.className = 'ithc-form-errors';
		errorsEl.hidden = true;
		modal.appendChild( errorsEl );

		var actions = document.createElement( 'div' );
		actions.className = 'ithc-form-actions';

		var cancelBtn = document.createElement( 'button' );
		cancelBtn.type = 'button';
		cancelBtn.className = 'ithc-btn-secondary';
		cancelBtn.textContent = mw.msg( 'infothequecore-cancel-button' );
		cancelBtn.addEventListener( 'click', closeOverlay );
		actions.appendChild( cancelBtn );

		var insertBtn = document.createElement( 'button' );
		insertBtn.type = 'button';
		insertBtn.className = 'ithc-btn-primary';
		insertBtn.textContent = mw.msg( 'infothequecore-insert-button' );
		insertBtn.addEventListener( 'click', function () {
			doInsert( schema, textarea, pendingBlock, titleContainer, tbody, errorsEl, insertBtn );
		} );
		actions.appendChild( insertBtn );
		modal.appendChild( actions );

		document.body.appendChild( overlay );
		currentOverlay = overlay;
	}

	// ---- Field / row rendering ----------------------------------------------

	/** Title fields (non-repeating), rendered as label + input, above the table. */
	function renderField( field, value ) {
		var wrapper = document.createElement( 'div' );
		wrapper.className = 'ithc-field';

		var label = document.createElement( 'label' );
		label.className = 'ithc-field-label';
		label.appendChild( document.createTextNode( field.label + ( field.required ? ' *' : '' ) ) );
		wrapper.appendChild( label );

		var input = createFieldInput( field, wrapper );
		input.value = value || '';
		label.appendChild( input );

		if ( field.help ) {
			var help = document.createElement( 'p' );
			help.className = 'ithc-field-help';
			help.textContent = field.help;
			wrapper.appendChild( help );
		}

		return wrapper;
	}

	function buildTableHead( schema ) {
		var thead = document.createElement( 'thead' );
		var tr = document.createElement( 'tr' );
		schema.rowFields.forEach( function ( field ) {
			var th = document.createElement( 'th' );
			th.textContent = field.label + ( field.required ? ' *' : '' );
			if ( field.help ) {
				th.title = field.help;
			}
			tr.appendChild( th );
		} );
		tr.appendChild( document.createElement( 'th' ) ); // remove-button column
		thead.appendChild( tr );
		return thead;
	}

	function buildRowTr( schema, rowValues ) {
		var tr = document.createElement( 'tr' );
		tr.className = 'ithc-row';

		schema.rowFields.forEach( function ( field ) {
			var td = document.createElement( 'td' );
			var input = createFieldInput( field, td );
			input.value = ( rowValues && rowValues[ field.key ] ) || '';
			td.appendChild( input );
			tr.appendChild( td );
		} );

		var removeTd = document.createElement( 'td' );
		removeTd.className = 'ithc-row-remove-cell';
		var removeBtn = document.createElement( 'button' );
		removeBtn.type = 'button';
		removeBtn.className = 'ithc-row-remove';
		removeBtn.textContent = '×';
		removeBtn.title = mw.msg( 'infothequecore-remove-row' );
		removeBtn.addEventListener( 'click', function () {
			tr.remove();
		} );
		removeTd.appendChild( removeBtn );
		tr.appendChild( removeTd );

		return tr;
	}

	/**
	 * Builds the actual <input>/<textarea> for a field, tagging it with
	 * data-ithc-key so collectFields() can read it back regardless of
	 * whether it lives in a labeled wrapper (title fields) or a bare table
	 * cell (row fields). A combobox's <datalist> is appended to
	 * datalistParent (the field's own container), since <datalist> can't
	 * be a child of <input>.
	 */
	function createFieldInput( field, datalistParent ) {
		var input;
		if ( field.widget === 'textarea' ) {
			input = document.createElement( 'textarea' );
			input.rows = 2;
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
				datalistParent.appendChild( datalist );
				input.setAttribute( 'list', listId );
			}
		}
		input.className = 'ithc-field-input';
		if ( field.example ) {
			input.placeholder = field.example;
		}
		if ( field.help ) {
			input.title = field.help;
		}
		input.dataset.ithcKey = field.key;
		return input;
	}

	function collectFields( container ) {
		var values = {};
		Array.prototype.forEach.call( container.querySelectorAll( '[data-ithc-key]' ), function ( input ) {
			values[ input.dataset.ithcKey ] = input.value;
		} );
		return values;
	}

	function collectRows( tbody ) {
		return Array.prototype.map.call( tbody.querySelectorAll( 'tr.ithc-row' ), collectFields );
	}

	// ---- Validate + generate + insert, in one step ---------------------------

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

	function doInsert( schema, textarea, pendingBlock, titleContainer, tbody, errorsEl, insertBtn ) {
		var titleValues = collectFields( titleContainer );
		var rowsValues = collectRows( tbody );

		errorsEl.hidden = true;
		insertBtn.disabled = true;

		api.post( {
			action: 'infothequecore',
			op: 'generate',
			schema: schema.id,
			title: JSON.stringify( titleValues ),
			rows: JSON.stringify( rowsValues ),
			formatversion: 2
		} ).done( function ( data ) {
			insertBtn.disabled = false;
			if ( data.errors && data.errors.length ) {
				showErrors( errorsEl, data.errors );
				return;
			}
			applyResult( textarea, pendingBlock, data.wikitext );
			closeOverlay();
		} ).fail( function ( code, err ) {
			insertBtn.disabled = false;
			showErrors( errorsEl, [ extractApiError( code, err ) ] );
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
