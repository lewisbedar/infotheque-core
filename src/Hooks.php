<?php

namespace MediaWiki\Extension\InfothequeCore;

/**
 * Loose parameter typing on purpose: EditPage/OutputPage/DatabaseUpdater
 * have moved namespaces across MediaWiki versions (as Html/Linker/
 * ParserOptions did for this wiki's 1.46 install — see
 * SpecialInfothequeCore), and these handlers only need a handful of
 * methods, so depending on the exact class isn't worth the risk of
 * guessing wrong.
 */
class Hooks {

	/**
	 * @param mixed $editor EditPage
	 * @param mixed $out OutputPage
	 */
	public static function onEditPageShowEditFormInitial( $editor, $out ): void {
		$out->addModules( 'ext.infothequeCore.editorButton' );
		$out->addJsConfigVars( 'ithcSchemas', SchemaExporter::exportAll() );
	}

	/**
	 * Exports ithcSchemas on every page view, not just classic source-mode
	 * edit form renders — EditPage::showEditForm:initial above doesn't
	 * fire when a page is opened directly into VisualEditor, so
	 * ext.infothequeCore.ve.js (loaded by VE itself as a plugin module)
	 * had no schema data to work with. Cheap pure computation, no DB
	 * calls, so exporting it unconditionally isn't worth gating further.
	 *
	 * @param mixed $out OutputPage
	 * @param mixed $skin Skin
	 */
	public static function onBeforePageDisplay( $out, $skin ): void {
		$out->addJsConfigVars( 'ithcSchemas', SchemaExporter::exportAll() );
	}

	/**
	 * Creates the ithc_options table (Support/Format icons, Langue,
	 * Pilotes types managed via Special:InfothequeCoreOptions) and seeds
	 * it with the values that shipped hardcoded before that page existed,
	 * so nothing changes for existing forms on first deploy.
	 *
	 * @param mixed $updater DatabaseUpdater
	 */
	public static function onLoadExtensionSchemaUpdates( $updater ): void {
		$updater->addExtensionTable( 'ithc_options', __DIR__ . '/../sql/tables.sql' );
		$updater->addExtensionUpdate( [ [ __CLASS__, 'seedOptionLists' ] ] );
	}

	/** @param mixed $updater DatabaseUpdater */
	public static function seedOptionLists( $updater ): void {
		$db = $updater->getDB();
		if ( $db->newSelectQueryBuilder()
			->select( '1' )
			->from( 'ithc_options' )
			->caller( __METHOD__ )
			->fetchRowCount() > 0
		) {
			return; // already seeded (or an admin has since edited the lists)
		}

		$seed = [
			'support-icons' => [
				[ 'disquette', 'Disquette', '[[Fichier:Icône disquettes.png|centré]]' ],
				[ 'disquette2', 'Disquette (variante)', '[[Fichier:Setupapi.dll 14 105.png|centré|sans_cadre]]' ],
				[ 'cd', 'CD-ROM / DVD', '[[Fichier:Icone CD.png|centré|sans_cadre]]' ],
				[ 'cddisquette', 'CD + disquettes', '[[Fichier:Mmcndmgr.dll 14 30548-1.png|centré|sans_cadre]]' ],
				[ 'zip', 'Fichier ZIP / téléchargement numérique', '[[Fichier:Zipfldr.dll 14 123-3.png|centré|sans_cadre]]' ],
				[ 'installateur', 'Installateur (.exe)', '[[Fichier:Netsetup.exe 14 3000-0.png|centré|sans_cadre]]' ],
			],
			'format-icons' => [
				[ 'pdf', 'PDF', '[[Fichier:Icône_PDF.png|centré|sans_cadre]]' ],
				[ 'texte', 'Fichier texte', '[[Fichier:Notepad_file-2.png|centré|sans_cadre]]' ],
				[ 'word', 'Fichier Word', '[[Fichier:Word_002.png|centré|sans_cadre]]' ],
			],
			'langue' => array_map(
				static fn ( string $label ): array => [ $label, $label, null ],
				[ 'Français', 'Anglais', 'Allemand', 'Espagnol', 'Italien', 'Multilingue' ]
			),
			'pilotes-types' => array_map(
				static fn ( string $label ): array => [ $label, $label, null ],
				[ 'Chipset', 'Graphique', 'Son', 'Réseau', 'Modem', 'Stockage', 'Autre' ]
			),
		];

		$rows = [];
		foreach ( $seed as $listId => $entries ) {
			$sort = 0;
			foreach ( $entries as [ $key, $label, $wikitext ] ) {
				$rows[] = [
					'ithco_list' => $listId,
					'ithco_sort' => $sort++,
					'ithco_key' => $key,
					'ithco_label' => $label,
					'ithco_wikitext' => $wikitext,
				];
			}
		}

		$db->newInsertQueryBuilder()
			->insertInto( 'ithc_options' )
			->rows( $rows )
			->caller( __METHOD__ )
			->execute();
	}
}
