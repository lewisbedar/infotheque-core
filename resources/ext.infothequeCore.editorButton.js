/**
 * Adds a single "Ajouter un modèle Infothèque" button next to the
 * source-mode edit textarea (#wpTextbox1). Clicking it reveals a small
 * column menu with the 4 assistant forms; picking one opens
 * Special:InfothequeCore in a modal overlay (iframe) inside the same
 * window/tab, and splices the result into the textarea on completion —
 * same cursor-insertion pattern as the existing "+ Ajouter un
 * téléchargement" gadget (MediaWiki:Common.js), generalized to all 4
 * forms and to full add/edit/delete of an existing table.
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

	var SCHEMAS = [
		{ id: 'telechargements-logiciels', templateName: 'Téléchargements', msgKey: 'infothequecore-form-telechargements-logiciels' },
		{ id: 'manuels', templateName: 'Téléchargements', msgKey: 'infothequecore-form-manuels' },
		{ id: 'configurations', templateName: 'Configurations', msgKey: 'infothequecore-form-configurations' },
		{ id: 'pilotes', templateName: 'Pilotes', msgKey: 'infothequecore-form-pilotes' }
	];

	var hasPendingRequest = false;
	var pendingBlock = null;
	var currentOverlay = null;

	function init() {
		var textarea = document.getElementById( 'wpTextbox1' );
		if ( !textarea ) {
			return; // not in source editing mode
		}
		addTrigger( textarea );
		window.addEventListener( 'message', function ( event ) {
			if (
				event.origin !== location.origin ||
				!hasPendingRequest ||
				!event.data ||
				event.data.type !== 'ithc-insert'
			) {
				return;
			}
			applyResult( textarea, event.data.wikitext );
			closeOverlay();
		} );
	}

	function addTrigger( textarea ) {
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

		SCHEMAS.forEach( function ( schema ) {
			var item = document.createElement( 'button' );
			item.type = 'button';
			item.className = 'ithc-dropdown-item';
			item.textContent = mw.msg( schema.msgKey );
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

	function openAssistant( textarea, schema ) {
		if ( currentOverlay ) {
			return; // one at a time
		}

		var cursorPos = textarea.selectionStart || 0;
		var block = findEnclosingBlock( textarea.value, schema.templateName, cursorPos );

		var params = { insert: '1', page: mw.config.get( 'wgPageName' ) };
		if ( block ) {
			params.existing = block.raw;
		}

		hasPendingRequest = true;
		pendingBlock = block ? { start: block.start, end: block.end } : null;

		openOverlay( mw.util.getUrl( 'Special:InfothequeCore/' + schema.id, params ) );
	}

	function openOverlay( url ) {
		var overlay = document.createElement( 'div' );
		overlay.className = 'ithc-overlay';
		overlay.addEventListener( 'click', function ( e ) {
			if ( e.target === overlay ) {
				cancelPending();
			}
		} );

		var modal = document.createElement( 'div' );
		modal.className = 'ithc-modal';

		var closeBtn = document.createElement( 'button' );
		closeBtn.type = 'button';
		closeBtn.className = 'ithc-modal-close';
		closeBtn.textContent = '×';
		closeBtn.setAttribute( 'aria-label', mw.msg( 'infothequecore-editor-close' ) );
		closeBtn.addEventListener( 'click', cancelPending );

		var iframe = document.createElement( 'iframe' );
		iframe.className = 'ithc-modal-iframe';
		iframe.src = url;

		modal.appendChild( closeBtn );
		modal.appendChild( iframe );
		overlay.appendChild( modal );
		document.body.appendChild( overlay );
		currentOverlay = overlay;
	}

	function cancelPending() {
		hasPendingRequest = false;
		pendingBlock = null;
		closeOverlay();
	}

	function closeOverlay() {
		if ( currentOverlay ) {
			currentOverlay.remove();
			currentOverlay = null;
		}
	}

	function applyResult( textarea, wikitext ) {
		if ( pendingBlock ) {
			var current = textarea.value;
			textarea.value = current.slice( 0, pendingBlock.start ) + wikitext + current.slice( pendingBlock.end + 1 );
		} else {
			var start = textarea.selectionStart || 0;
			var end = textarea.selectionEnd || 0;
			textarea.value = textarea.value.slice( 0, start ) + wikitext + textarea.value.slice( end );
		}

		hasPendingRequest = false;
		pendingBlock = null;
		textarea.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		textarea.focus();
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
}() );
