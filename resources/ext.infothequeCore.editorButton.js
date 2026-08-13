/**
 * Adds a small row of buttons next to the source-mode edit textarea
 * (#wpTextbox1), one per assistant form. Each opens Special:InfothequeCore
 * as a popup and, on completion, splices the result into the textarea —
 * same DOM-injection/cursor-insertion pattern as the existing
 * "+ Ajouter un téléchargement" gadget (MediaWiki:Common.js), generalized
 * to all 4 forms and to full add/edit/delete of an existing table.
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

	var activePopup = null;
	var hasPendingRequest = false;
	var pendingBlock = null;

	function init() {
		var textarea = document.getElementById( 'wpTextbox1' );
		if ( !textarea ) {
			return; // not in source editing mode
		}
		addButtons( textarea );
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
		} );
	}

	function addButtons( textarea ) {
		var wrap = document.createElement( 'div' );
		wrap.className = 'ithc-editor-buttons';
		SCHEMAS.forEach( function ( schema ) {
			var btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'ithc-editor-btn';
			btn.textContent = '+ ' + mw.msg( schema.msgKey );
			btn.addEventListener( 'click', function () {
				openAssistant( textarea, schema );
			} );
			wrap.appendChild( btn );
		} );
		textarea.parentNode.insertBefore( wrap, textarea );
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
		if ( activePopup && !activePopup.closed ) {
			activePopup.focus();
			return;
		}

		var cursorPos = textarea.selectionStart || 0;
		var block = findEnclosingBlock( textarea.value, schema.templateName, cursorPos );

		var params = { insert: '1', page: mw.config.get( 'wgPageName' ) };
		if ( block ) {
			params.existing = block.raw;
		}

		activePopup = window.open(
			mw.util.getUrl( 'Special:InfothequeCore/' + schema.id, params ),
			'ithcInsert',
			'width=760,height=800'
		);
		if ( !activePopup ) {
			return; // popup blocked
		}

		hasPendingRequest = true;
		pendingBlock = block ? { start: block.start, end: block.end } : null;
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
