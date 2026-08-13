/**
 * Client-side behaviour for Special:InfothequeCore.
 *
 * In insert mode (opened inside the editor's modal iframe, or as a popup
 * as a fallback), the preview step shows a "Insérer dans l'éditeur"
 * button instead of a publish form: nothing is saved here, the generated
 * wikitext is just handed back to the parent/opener window and the host
 * page closes this popup or removes the modal.
 */
( function () {
	'use strict';

	function getInsertTarget() {
		if ( window.opener ) {
			return window.opener;
		}
		if ( window.parent && window.parent !== window ) {
			return window.parent;
		}
		return null;
	}

	function initInsertButton() {
		var btn = document.getElementById( 'ithc-insert-btn' );
		var target = getInsertTarget();
		if ( !btn || !target ) {
			return;
		}
		btn.addEventListener( 'click', function () {
			target.postMessage(
				{ type: 'ithc-insert', wikitext: btn.dataset.wikitext },
				location.origin
			);
			if ( window.opener ) {
				window.close();
			}
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', initInsertButton );
	} else {
		initInsertButton();
	}
}() );
