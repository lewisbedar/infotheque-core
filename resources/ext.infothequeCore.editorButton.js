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
 * Rows pre-filled from an existing block start locked (read-only, with a
 * pencil button to unlock) as a safety net against accidentally altering
 * already-published data; freshly added rows start editable.
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
	// Relative column weights for known fields — gives more room to
	// "édition" and less to short fields like "version"/"langue". Anything
	// not listed falls back to an even share. These are weights, not
	// percentages: buildColgroup() normalizes them against whichever
	// fields a given schema actually has, so forms with fewer columns
	// still fill the table width instead of leaving a gap.
	var COLUMN_WIDTHS = {
		edition: 16,
		version: 7,
		langue: 7,
		description: 20,
		serial: 9,
		format: 9,
		image: 11,
		liens: 15
	};
	var DEFAULT_COLUMN_WIDTH = 12;
	var ACTIONS_COLUMN_WIDTH = 6;

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

	/** "Téléchargements : Windows 95" — makes clear which page a form applies to. */
	function schemaDisplayLabel( schema ) {
		return schema.label + ' : ' + mw.config.get( 'wgPageName' ).replace( /_/g, ' ' );
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
			buildOverlay( schema, textarea, pendingBlock, {}, [ {} ], { preFilled: false } );
			return;
		}

		buildOverlay( schema, textarea, pendingBlock, {}, [ {} ], { loading: true } );
		api.post( {
			action: 'infothequecore',
			op: 'parseexisting',
			schema: schema.id,
			raw: block.raw,
			formatversion: 2
		} ).done( function ( data ) {
			var rows = ( data.rows && data.rows.length ) ? data.rows : [ {} ];
			buildOverlay( schema, textarea, pendingBlock, data.title || {}, rows, { preFilled: true } );
		} ).fail( function () {
			buildOverlay( schema, textarea, pendingBlock, {}, [ {} ], { preFilled: false } );
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
	 * (options.loading=true) while an existing block is being fetched/
	 * parsed, then again with the real pre-filled data once that resolves
	 * (options.preFilled=true, so initial rows start locked).
	 */
	function buildOverlay( schema, textarea, pendingBlock, titleValues, rowsValues, options ) {
		options = options || {};
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
		heading.textContent = schemaDisplayLabel( schema );
		modal.appendChild( heading );

		if ( options.loading ) {
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
		table.appendChild( buildColgroup( schema ) );
		table.appendChild( buildTableHead( schema ) );
		var tbody = document.createElement( 'tbody' );
		rowsValues.forEach( function ( rowVals ) {
			tbody.appendChild( buildRowTr( schema, rowVals, !!options.preFilled ) );
		} );
		table.appendChild( tbody );
		tableWrap.appendChild( table );
		modal.appendChild( tableWrap );

		var addRowBtn = document.createElement( 'button' );
		addRowBtn.type = 'button';
		addRowBtn.className = 'ithc-add-row-btn';
		addRowBtn.textContent = mw.msg( 'infothequecore-add-row' );
		addRowBtn.addEventListener( 'click', function () {
			tbody.appendChild( buildRowTr( schema, {}, false ) );
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

	// ---- Row construction: fields + lock/edit + reorder + remove ------------

	function buildColgroup( schema ) {
		var colgroup = document.createElement( 'colgroup' );
		var weights = schema.rowFields.map( function ( field ) {
			return COLUMN_WIDTHS[ field.key ] || DEFAULT_COLUMN_WIDTH;
		} );
		var totalWeight = weights.reduce( function ( sum, w ) {
			return sum + w;
		}, 0 );
		var available = 100 - ACTIONS_COLUMN_WIDTH;
		weights.forEach( function ( weight ) {
			var col = document.createElement( 'col' );
			col.style.width = ( weight / totalWeight * available ) + '%';
			colgroup.appendChild( col );
		} );
		var actionsCol = document.createElement( 'col' );
		actionsCol.style.width = ACTIONS_COLUMN_WIDTH + '%';
		colgroup.appendChild( actionsCol );
		return colgroup;
	}

	function buildTableHead( schema ) {
		var thead = document.createElement( 'thead' );
		var tr = document.createElement( 'tr' );
		schema.rowFields.forEach( function ( field ) {
			var th = document.createElement( 'th' );
			th.appendChild( document.createTextNode( field.label + ( field.required ? ' *' : '' ) ) );
			if ( field.help ) {
				th.appendChild( buildHelpIcon( field.help ) );
			}
			tr.appendChild( th );
		} );
		tr.appendChild( document.createElement( 'th' ) ); // row actions column
		thead.appendChild( tr );
		return thead;
	}

	/** A small "?" icon showing a floating text bubble on hover (and on focus, for keyboard use). */
	function buildHelpIcon( helpText ) {
		var icon = document.createElement( 'button' );
		icon.type = 'button';
		icon.className = 'ithc-help-icon';
		icon.textContent = '?';

		var bubble = document.createElement( 'div' );
		bubble.className = 'ithc-help-bubble';
		bubble.textContent = helpText;
		bubble.hidden = true;

		function show() {
			var rect = icon.getBoundingClientRect();
			bubble.hidden = false;
			var bubbleRect = bubble.getBoundingClientRect();
			var left = Math.min( rect.left, window.innerWidth - bubbleRect.width - 8 );
			bubble.style.top = ( rect.bottom + 4 + window.scrollY ) + 'px';
			bubble.style.left = ( Math.max( left, 8 ) + window.scrollX ) + 'px';
		}
		function hide() {
			bubble.hidden = true;
		}

		icon.addEventListener( 'mouseenter', show );
		icon.addEventListener( 'mouseleave', hide );
		icon.addEventListener( 'focus', show );
		icon.addEventListener( 'blur', hide );
		// Prevent the icon from acting as a submit-like click target inside the table.
		icon.addEventListener( 'click', function ( e ) {
			e.preventDefault();
		} );
		window.addEventListener( 'scroll', hide, true );

		var wrap = document.createDocumentFragment();
		wrap.appendChild( icon );
		wrap.appendChild( bubble );
		return wrap;
	}

	function buildRowTr( schema, rowValues, locked ) {
		var tr = document.createElement( 'tr' );
		tr.className = 'ithc-row';

		var fieldEls = [];
		schema.rowFields.forEach( function ( field ) {
			var td = document.createElement( 'td' );
			td.className = 'ithc-col-' + field.key;
			fieldEls.push( renderFieldValue( field, rowValues ? rowValues[ field.key ] : '', td ) );
			tr.appendChild( td );
		} );

		var actionsTd = document.createElement( 'td' );
		actionsTd.className = 'ithc-row-actions-cell';

		var editBtn = document.createElement( 'button' );
		editBtn.type = 'button';
		editBtn.className = 'ithc-row-edit';
		editBtn.textContent = '✏️';
		editBtn.title = mw.msg( 'infothequecore-edit-row' );
		editBtn.addEventListener( 'click', function () {
			setRowLocked( tr, fieldEls, editBtn, false );
		} );
		actionsTd.appendChild( editBtn );

		var upBtn = document.createElement( 'button' );
		upBtn.type = 'button';
		upBtn.className = 'ithc-row-move';
		upBtn.textContent = '↑';
		upBtn.title = mw.msg( 'infothequecore-move-row-up' );
		upBtn.addEventListener( 'click', function () {
			var prev = tr.previousElementSibling;
			if ( prev ) {
				tr.parentNode.insertBefore( tr, prev );
			}
		} );
		actionsTd.appendChild( upBtn );

		var downBtn = document.createElement( 'button' );
		downBtn.type = 'button';
		downBtn.className = 'ithc-row-move';
		downBtn.textContent = '↓';
		downBtn.title = mw.msg( 'infothequecore-move-row-down' );
		downBtn.addEventListener( 'click', function () {
			var next = tr.nextElementSibling;
			if ( next ) {
				tr.parentNode.insertBefore( next, tr );
			}
		} );
		actionsTd.appendChild( downBtn );

		var removeBtn = document.createElement( 'button' );
		removeBtn.type = 'button';
		removeBtn.className = 'ithc-row-remove';
		removeBtn.textContent = '×';
		removeBtn.title = mw.msg( 'infothequecore-remove-row' );
		removeBtn.addEventListener( 'click', function () {
			tr.remove();
		} );
		actionsTd.appendChild( removeBtn );

		tr.appendChild( actionsTd );

		setRowLocked( tr, fieldEls, editBtn, !!locked );

		return tr;
	}

	function setRowLocked( tr, fieldEls, editBtn, locked ) {
		tr.classList.toggle( 'ithc-row-locked', locked );
		fieldEls.forEach( function ( el ) {
			if ( 'disabled' in el ) {
				el.disabled = locked;
			}
			Array.prototype.forEach.call(
				el.querySelectorAll( 'input, textarea, select, button' ),
				function ( ctrl ) {
					ctrl.disabled = locked;
				}
			);
		} );
		editBtn.hidden = !locked;
	}

	// ---- Field rendering, by widget type -------------------------------------

	/** Title fields (non-repeating), rendered as label + input, above the table. */
	function renderField( field, value ) {
		var wrapper = document.createElement( 'div' );
		wrapper.className = 'ithc-field';

		var label = document.createElement( 'label' );
		label.className = 'ithc-field-label';
		label.appendChild( document.createTextNode( field.label + ( field.required ? ' *' : '' ) ) );
		wrapper.appendChild( label );

		renderFieldValue( field, value, label );

		if ( field.help ) {
			var help = document.createElement( 'p' );
			help.className = 'ithc-field-help';
			help.textContent = field.help;
			wrapper.appendChild( help );
		}

		return wrapper;
	}

	/**
	 * Dispatches to the right widget renderer, appends it into `container`,
	 * and returns the element carrying data-ithc-field / ithcGetValue().
	 */
	function renderFieldValue( field, value, container ) {
		switch ( field.widget ) {
			case 'combobox':
				return renderComboboxInput( field, value, container );
			case 'select':
				return renderSelectInput( field, value, container );
			case 'multiselect':
				return renderMultiSelectInput( field, value, container );
			case 'links':
				return renderLinksInput( field, value, container );
			case 'file':
				return renderFileInput( field, value, container );
			case 'textarea':
			case 'text':
			default:
				return renderSimpleInput( field, value, container );
		}
	}

	function markField( el, field, getValue ) {
		el.dataset.ithcField = field.key;
		el.ithcFieldKey = field.key;
		el.ithcGetValue = getValue;
		return el;
	}

	function renderSimpleInput( field, value, container ) {
		var input = field.widget === 'textarea' ? document.createElement( 'textarea' ) : document.createElement( 'input' );
		if ( field.widget === 'textarea' ) {
			input.rows = 2;
		} else {
			input.type = 'text';
		}
		input.className = 'ithc-field-input';
		if ( field.example ) {
			input.placeholder = field.example;
		}
		if ( field.help ) {
			input.title = field.help;
		}
		input.value = value || '';
		container.appendChild( input );
		return markField( input, field, function () {
			return input.value;
		} );
	}

	function renderComboboxInput( field, value, container ) {
		var input = document.createElement( 'input' );
		input.type = 'text';
		input.className = 'ithc-field-input';
		if ( field.example ) {
			input.placeholder = field.example;
		}
		if ( field.suggestedValues && field.suggestedValues.length ) {
			var listId = 'ithc-datalist-' + ( fieldIdCounter++ );
			var datalist = document.createElement( 'datalist' );
			datalist.id = listId;
			field.suggestedValues.forEach( function ( v ) {
				var opt = document.createElement( 'option' );
				opt.value = v;
				datalist.appendChild( opt );
			} );
			container.appendChild( datalist );
			input.setAttribute( 'list', listId );
		}
		input.value = value || '';
		container.appendChild( input );
		return markField( input, field, function () {
			return input.value;
		} );
	}

	/** Closed choice list; a value matching no known key falls back to a free-text "autre" field. */
	function renderSelectInput( field, value, container ) {
		var wrap = document.createElement( 'span' );
		wrap.className = 'ithc-select-wrap';

		var select = document.createElement( 'select' );
		select.className = 'ithc-field-input';
		( field.options || [] ).forEach( function ( opt ) {
			var o = document.createElement( 'option' );
			o.value = opt.key;
			o.textContent = opt.label;
			if ( opt.key === value ) {
				o.selected = true;
			}
			select.appendChild( o );
		} );

		wrap.appendChild( select );
		container.appendChild( wrap );

		return markField( wrap, field, function () {
			return select.value;
		} );
	}

	/** Several choices at once (checkboxes), joined with ", ". */
	/** Closed dropdown button that opens a checkbox panel — several values at once, joined with ", ". */
	function renderMultiSelectInput( field, value, container ) {
		var wrap = document.createElement( 'span' );
		wrap.className = 'ithc-multiselect-wrap';

		var button = document.createElement( 'button' );
		button.type = 'button';
		button.className = 'ithc-field-input ithc-multiselect-btn';
		wrap.appendChild( button );

		var panel = document.createElement( 'div' );
		panel.className = 'ithc-multiselect-panel';
		panel.hidden = true;
		wrap.appendChild( panel );

		var selected = ( value || '' ).split( ',' ).map( function ( s ) {
			return s.trim();
		} ).filter( Boolean );

		var boxes = [];
		( field.suggestedValues || [] ).forEach( function ( v ) {
			var label = document.createElement( 'label' );
			label.className = 'ithc-checkbox-label';
			var cb = document.createElement( 'input' );
			cb.type = 'checkbox';
			cb.value = v;
			cb.checked = selected.indexOf( v ) !== -1;
			cb.addEventListener( 'change', updateButtonText );
			boxes.push( cb );
			label.appendChild( cb );
			label.appendChild( document.createTextNode( ' ' + v ) );
			panel.appendChild( label );
		} );

		function updateButtonText() {
			var chosen = boxes.filter( function ( b ) {
				return b.checked;
			} ).map( function ( b ) {
				return b.value;
			} );
			button.textContent = chosen.length ? chosen.join( ', ' ) : mw.msg( 'infothequecore-select-placeholder' );
		}
		updateButtonText();

		button.addEventListener( 'click', function ( e ) {
			e.stopPropagation();
			if ( panel.hidden ) {
				panel.hidden = false;
				positionPanel();
			} else {
				panel.hidden = true;
			}
		} );

		/**
		 * Opens below the button by default; if there isn't enough room
		 * before the viewport bottom (common for rows near the bottom of a
		 * tall, scrolled overlay) but there IS enough above, opens upward
		 * instead — otherwise the panel could render past the visible
		 * screen. Horizontally clamped so it doesn't overflow the right edge.
		 */
		function positionPanel() {
			var rect = button.getBoundingClientRect();
			var panelRect = panel.getBoundingClientRect();
			var spaceBelow = window.innerHeight - rect.bottom;
			var top = rect.bottom + 2;
			if ( spaceBelow < panelRect.height + 8 && rect.top - panelRect.height - 8 > 0 ) {
				top = rect.top - panelRect.height - 2;
			}
			var left = Math.min( rect.left, window.innerWidth - panelRect.width - 8 );
			panel.style.top = ( top + window.scrollY ) + 'px';
			panel.style.left = ( Math.max( left, 8 ) + window.scrollX ) + 'px';
			panel.style.minWidth = rect.width + 'px';
		}
		document.addEventListener( 'click', function ( e ) {
			if ( e.target !== button && !panel.contains( e.target ) ) {
				panel.hidden = true;
			}
		} );
		window.addEventListener( 'scroll', function () {
			panel.hidden = true;
		}, true );

		container.appendChild( wrap );
		return markField( wrap, field, function () {
			return boxes.filter( function ( b ) {
				return b.checked;
			} ).map( function ( b ) {
				return b.value;
			} ).join( ', ' );
		} );
	}

	/** Structured (url, label) pairs -> "[url label]" or a bulleted list of several. */
	function renderLinksInput( field, value, container ) {
		var wrap = document.createElement( 'div' );
		wrap.className = 'ithc-links-wrap';

		var list = document.createElement( 'div' );
		list.className = 'ithc-links-list';
		wrap.appendChild( list );

		var initial = [];
		if ( value ) {
			try {
				initial = JSON.parse( value ) || [];
			} catch ( e ) {
				initial = [];
			}
		}
		if ( !initial.length ) {
			initial = [ { url: '', label: '' } ];
		}

		function addLinkRow( link ) {
			var row = document.createElement( 'div' );
			row.className = 'ithc-links-row';

			var urlInput = document.createElement( 'input' );
			urlInput.type = 'text';
			urlInput.className = 'ithc-field-input ithc-links-url';
			urlInput.placeholder = mw.msg( 'infothequecore-links-url-placeholder' );
			urlInput.value = ( link && link.url ) || '';

			var labelInput = document.createElement( 'input' );
			labelInput.type = 'text';
			labelInput.className = 'ithc-field-input ithc-links-label';
			labelInput.placeholder = mw.msg( 'infothequecore-links-label-placeholder' );
			labelInput.value = ( link && link.label ) || '';

			var removeBtn = document.createElement( 'button' );
			removeBtn.type = 'button';
			removeBtn.className = 'ithc-links-remove';
			removeBtn.textContent = '×';
			removeBtn.title = mw.msg( 'infothequecore-links-remove' );
			removeBtn.addEventListener( 'click', function () {
				row.remove();
			} );

			row.appendChild( urlInput );
			row.appendChild( labelInput );
			row.appendChild( removeBtn );
			list.appendChild( row );
		}

		initial.forEach( addLinkRow );

		var addBtn = document.createElement( 'button' );
		addBtn.type = 'button';
		addBtn.className = 'ithc-links-add';
		addBtn.textContent = mw.msg( 'infothequecore-links-add' );
		addBtn.addEventListener( 'click', function () {
			addLinkRow( { url: '', label: '' } );
		} );
		wrap.appendChild( addBtn );

		container.appendChild( wrap );

		return markField( wrap, field, function () {
			var links = Array.prototype.map.call( list.querySelectorAll( '.ithc-links-row' ), function ( row ) {
				return {
					url: row.querySelector( '.ithc-links-url' ).value.trim(),
					label: row.querySelector( '.ithc-links-label' ).value.trim()
				};
			} ).filter( function ( l ) {
				return l.url;
			} );
			return JSON.stringify( links );
		} );
	}

	/** Bare wiki file name, with a live thumbnail preview and a search-to-browse dropdown. */
	function renderFileInput( field, value, container ) {
		var wrap = document.createElement( 'span' );
		wrap.className = 'ithc-file-wrap';

		var input = document.createElement( 'input' );
		input.type = 'text';
		input.className = 'ithc-field-input';
		input.placeholder = field.example || mw.msg( 'infothequecore-photo-browse-placeholder' );
		if ( field.help ) {
			input.title = field.help;
		}
		input.value = value || '';

		var thumb = document.createElement( 'img' );
		thumb.className = 'ithc-file-thumb';
		thumb.alt = '';
		thumb.hidden = true;

		var suggestions = document.createElement( 'div' );
		suggestions.className = 'ithc-file-suggestions';
		suggestions.hidden = true;

		var searchTimer = null;

		function updateThumb() {
			var name = input.value.trim();
			if ( !name ) {
				thumb.hidden = true;
				return;
			}
			api.get( {
				action: 'query',
				titles: 'File:' + name,
				prop: 'imageinfo',
				iiprop: 'url',
				iiurlwidth: 80,
				formatversion: 2
			} ).done( function ( data ) {
				var pages = ( data.query && data.query.pages ) || [];
				var info = pages[ 0 ] && pages[ 0 ].imageinfo && pages[ 0 ].imageinfo[ 0 ];
				if ( info && info.thumburl ) {
					thumb.src = info.thumburl;
					thumb.hidden = false;
				} else {
					thumb.hidden = true;
				}
			} ).fail( function () {
				thumb.hidden = true;
			} );
		}

		function searchFiles( term ) {
			api.get( {
				action: 'query',
				list: 'allimages',
				aiprefix: term,
				ailimit: 8,
				formatversion: 2
			} ).done( function ( data ) {
				var files = ( data.query && data.query.allimages ) || [];
				suggestions.innerHTML = '';
				if ( !files.length ) {
					suggestions.hidden = true;
					return;
				}
				files.forEach( function ( f ) {
					var item = document.createElement( 'button' );
					item.type = 'button';
					item.className = 'ithc-file-suggestion';
					item.textContent = f.name;
					item.addEventListener( 'click', function () {
						input.value = f.name;
						suggestions.hidden = true;
						updateThumb();
					} );
					suggestions.appendChild( item );
				} );
				suggestions.hidden = false;
			} ).fail( function () {
				suggestions.hidden = true;
			} );
		}

		input.addEventListener( 'input', function () {
			updateThumb();
			clearTimeout( searchTimer );
			var term = input.value.trim();
			if ( !term ) {
				suggestions.hidden = true;
				suggestions.innerHTML = '';
				return;
			}
			searchTimer = setTimeout( function () {
				searchFiles( term );
			}, 300 );
		} );
		input.addEventListener( 'focus', function () {
			if ( input.value.trim() ) {
				searchFiles( input.value.trim() );
			}
		} );
		document.addEventListener( 'click', function ( e ) {
			if ( !wrap.contains( e.target ) ) {
				suggestions.hidden = true;
			}
		} );

		wrap.appendChild( input );
		wrap.appendChild( thumb );
		wrap.appendChild( suggestions );
		container.appendChild( wrap );

		if ( value ) {
			updateThumb();
		}

		return markField( wrap, field, function () {
			return input.value;
		} );
	}

	function collectFields( container ) {
		var values = {};
		Array.prototype.forEach.call( container.querySelectorAll( '[data-ithc-field]' ), function ( el ) {
			values[ el.ithcFieldKey ] = el.ithcGetValue();
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
