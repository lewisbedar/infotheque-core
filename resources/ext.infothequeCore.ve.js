/**
 * VisualEditor integration: reuses the exact same overlay/widgets as the
 * source-mode editor button (mw.libs.infothequeCore.buildOverlay(), see
 * ext.infothequeCore.editorButton.js — this module depends on it) but
 * swaps the "detect existing / insert result" glue for VE's document
 * model instead of textarea string-splicing:
 *  - Detect: VE already stores a transclusion's parameters pre-split
 *    (Parsoid did that when the page loaded) on the ve.dm.MWTransclusionNode
 *    itself, as the Parsoid "mw" data-attribute — no brace/pipe counting
 *    needed the way source mode has to.
 *  - Insert: builds that same "mw" data-attribute shape from the API's
 *    structured (per-field) generate() output, and writes it via a
 *    ve.dm.Transaction — either updating the existing node's attribute,
 *    or inserting a brand new mwTransclusion node.
 *
 * This is the newest, least-proven part of the extension: unlike the
 * source-mode textarea glue (built and tested against this wiki over many
 * rounds), the ve.dm.MWTransclusionNode/Transaction mechanics here haven't
 * been exercised live. If something silently doesn't work, check the
 * browser console first, then verify against VisualEditor's own source
 * (mediawiki.org/wiki/VisualEditor or the extension's own JS) for the
 * exact expected shape of the "mw" attribute and the transaction API.
 */
( function () {
	'use strict';

	if ( typeof ve === 'undefined' || !ve.ui || !ve.dm || !ve.dm.MWTransclusionNode ) {
		return; // VisualEditor (or its MediaWiki-specific classes) isn't loaded
	}

	var SCHEMA_IDS = [ 'telechargements-logiciels', 'manuels', 'configurations', 'pilotes' ];
	var api = new mw.Api();

	/** Bare template name from a Parsoid transclusion target ("Modèle:Pilotes" or "Pilotes" -> "Pilotes"). */
	function bareTemplateName( target ) {
		return String( target || '' ).replace( /^.*:/, '' ).trim();
	}

	function schemaForTemplateName( name, schemas ) {
		for ( var i = 0; i < SCHEMA_IDS.length; i++ ) {
			var schema = schemas[ SCHEMA_IDS[ i ] ];
			if ( schema && schema.templateName === name ) {
				return schema;
			}
		}
		return null;
	}

	/**
	 * If `node` is a single-template MWTransclusionNode matching one of
	 * our schemas, returns { schema, params, node } — params is a flat
	 * "paramName" -> raw wikitext value map, straight from Parsoid's own
	 * already-split data.
	 */
	function readMatchingTransclusion( node, schemas ) {
		if ( !node || !( node instanceof ve.dm.MWTransclusionNode ) ) {
			return null;
		}
		var mwData = node.getAttribute( 'mw' );
		if ( !mwData || !Array.isArray( mwData.parts ) || mwData.parts.length !== 1 || !mwData.parts[ 0 ].template ) {
			return null; // multi-part transclusion, or a non-template part: out of scope
		}
		var part = mwData.parts[ 0 ].template;
		var target = part.target && ( part.target.wt || part.target.href );
		var schema = schemaForTemplateName( bareTemplateName( target ), schemas );
		if ( !schema ) {
			return null;
		}
		var params = {};
		Object.keys( part.params || {} ).forEach( function ( key ) {
			params[ key ] = ( part.params[ key ] && part.params[ key ].wt ) || '';
		} );
		return { schema: schema, params: params, node: node };
	}

	/** Parsoid "mw" data-attribute shape, built from the API's structured generate() output. */
	function buildMwData( schema, structured ) {
		var params = {};
		Object.keys( ( structured && structured.title ) || {} ).forEach( function ( key ) {
			params[ key ] = { wt: structured.title[ key ] };
		} );
		( ( structured && structured.rows ) || [] ).forEach( function ( row, i ) {
			Object.keys( row ).forEach( function ( key ) {
				params[ key + ( i + 1 ) ] = { wt: row[ key ] };
			} );
		} );
		return {
			parts: [ {
				template: {
					target: {
						wt: schema.templateName,
						href: './' + mw.util.wikiUrlencode( 'Modèle:' + schema.templateName )
					},
					params: params
				}
			} ]
		};
	}

	function insertOrUpdate( surface, existingNode, schema, wikitext, structured ) {
		var surfaceModel = surface.getModel();
		var mwData = buildMwData( schema, structured );

		if ( existingNode ) {
			var tx = ve.dm.TransactionBuilder.static.newFromAttributeChanges(
				surfaceModel.getDocument(),
				existingNode.getOuterRange().start,
				{ mw: mwData }
			);
			surfaceModel.change( tx );
			return;
		}

		surfaceModel.getFragment().insertContent( [
			{ type: 'mwTransclusion', attributes: { mw: mwData } },
			{ type: '/mwTransclusion' }
		] );
	}

	function openForSchema( surface, schema, existing ) {
		var onInsert = function ( wikitext, structured ) {
			insertOrUpdate( surface, existing ? existing.node : null, schema, wikitext, structured );
		};

		if ( !existing ) {
			mw.libs.infothequeCore.buildOverlay( schema, {}, [ {} ], { preFilled: false, onInsert: onInsert } );
			return;
		}

		api.post( {
			action: 'infothequecore',
			op: 'parseexisting',
			schema: schema.id,
			params: JSON.stringify( existing.params ),
			formatversion: 2
		} ).done( function ( data ) {
			var rows = ( data.rows && data.rows.length ) ? data.rows : [ {} ];
			mw.libs.infothequeCore.buildOverlay( schema, data.title || {}, rows, {
				preFilled: true,
				mismatchLabel: data.possibleMismatch || null,
				onInsert: onInsert
			} );
		} ).fail( function () {
			mw.libs.infothequeCore.buildOverlay( schema, {}, [ {} ], { preFilled: false, onInsert: onInsert } );
		} );
	}

	/** Small OOUI menu with the 4 schemas — mirrors the source-mode dropdown trigger. */
	function openPicker( surface ) {
		var schemas = mw.config.get( 'ithcSchemas' );
		if ( !schemas ) {
			return;
		}

		var fragment = surface.getModel().getFragment();
		var selectedNode = fragment && fragment.getSelectedNode && fragment.getSelectedNode();
		var existing = readMatchingTransclusion( selectedNode, schemas );
		if ( existing ) {
			openForSchema( surface, existing.schema, existing );
			return;
		}

		var items = SCHEMA_IDS.filter( function ( id ) {
			return !!schemas[ id ];
		} ).map( function ( id ) {
			return new OO.ui.MenuOptionWidget( { data: id, label: schemas[ id ].label } );
		} );
		var menu = new OO.ui.MenuSelectWidget( { items: items } );
		document.body.appendChild( menu.$element[ 0 ] );
		menu.toggle( true );
		menu.on( 'choose', function ( item ) {
			menu.$element.remove();
			openForSchema( surface, schemas[ item.getData() ], null );
		} );
		menu.on( 'toggle', function ( shown ) {
			if ( !shown ) {
				menu.$element.remove();
			}
		} );
	}

	// ---- ve.ui.Action / Command / Tool registration -------------------------

	function InfothequeCoreAction( surface ) {
		InfothequeCoreAction.super.call( this, surface );
	}
	OO.inheritClass( InfothequeCoreAction, ve.ui.Action );
	InfothequeCoreAction.static.name = 'infothequeCore';
	InfothequeCoreAction.static.methods = [ 'open' ];
	InfothequeCoreAction.prototype.open = function () {
		openPicker( this.surface );
		return true;
	};
	ve.ui.actionFactory.register( InfothequeCoreAction );

	ve.ui.commandRegistry.register(
		new ve.ui.Command( 'infothequeCoreOpen', 'infothequeCore', 'open' )
	);

	function InfothequeCoreTool() {
		InfothequeCoreTool.super.apply( this, arguments );
	}
	OO.inheritClass( InfothequeCoreTool, ve.ui.Tool );
	InfothequeCoreTool.static.name = 'infothequeCoreOpen';
	InfothequeCoreTool.static.group = 'insert';
	// Placeholder built-in OOUI icon — swap for the wiki's own icon once
	// Lewis supplies the image (per his request), via a custom-registered
	// OOUI icon rather than this generic one.
	InfothequeCoreTool.static.icon = 'add';
	InfothequeCoreTool.static.title = mw.msg( 'infothequecore-editor-trigger' );
	InfothequeCoreTool.static.commandName = 'infothequeCoreOpen';
	ve.ui.toolFactory.register( InfothequeCoreTool );
}() );
