/**
 * Client-side behaviour for Special:InfothequeCore.
 *
 * In insert mode (opened as a popup from ext.infothequeCore.editorButton.js),
 * the preview step shows a "Insérer dans l'éditeur" button instead of a
 * publish form: nothing is saved here, the generated wikitext is just
 * handed back to the opener window and this popup closes itself.
 */
( function () {
	'use strict';

	function initInsertButton() {
		var btn = document.getElementById( 'ithc-insert-btn' );
		if ( !btn || !window.opener ) {
			return;
		}
		btn.addEventListener( 'click', function () {
			window.opener.postMessage(
				{ type: 'ithc-insert', wikitext: btn.dataset.wikitext },
				location.origin
			);
			window.close();
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', initInsertButton );
	} else {
		initInsertButton();
	}
}() );
