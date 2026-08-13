<?php

namespace MediaWiki\Extension\InfothequeCore\Schema;

/**
 * Central source of truth for the field conventions of each wikitext
 * template covered by the assistant. Mirrored from the live TemplateData
 * of Modèle:Téléchargements, Modèle:Configurations and Modèle:Pilotes on
 * infotheque.fr (and their Module:* Lua counterparts) — see the project's
 * état du projet page for the wider history behind these conventions.
 *
 * "Téléchargements logiciels/jeux" and "Manuels & documentation" both
 * target the same Modèle:Téléchargements (there is only one wikitext
 * template), but are kept as two distinct schemas here because the two
 * usages need different labels, help text and required fields.
 */
class SchemaRegistry {

	/** @return FormSchema[] keyed by schema id */
	public static function all(): array {
		return [
			'telechargements-logiciels' => self::telechargementsLogiciels(),
			'manuels' => self::manuels(),
			'configurations' => self::configurations(),
			'pilotes' => self::pilotes(),
		];
	}

	public static function get( string $id ): ?FormSchema {
		return self::all()[$id] ?? null;
	}

	private static function telechargementsLogiciels(): FormSchema {
		return new FormSchema(
			id: 'telechargements-logiciels',
			labelMsg: 'infothequecore-form-telechargements-logiciels',
			templateName: 'Téléchargements',
			// No title field: keep the wiki's own default ("Versions
			// archivées de [nom de la page]") rather than letting the
			// form override it — per Lewis, don't ask for a title here.
			titleFields: [],
			rowFields: [
				new FieldDefinition(
					key: 'edition',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-edition',
					required: true,
					example: 'Windows 95'
				),
				new FieldDefinition(
					key: 'version',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-version',
					example: 'OSR 2.5 OEM 4.03.1216'
				),
				new FieldDefinition(
					key: 'langue',
					widget: FieldWidget::MultiSelect,
					labelMsg: 'infothequecore-field-langue',
					suggestedValues: [ 'Français', 'Anglais', 'Allemand', 'Espagnol', 'Italien' ]
				),
				new FieldDefinition(
					key: 'description',
					widget: FieldWidget::Textarea,
					labelMsg: 'infothequecore-field-description',
					helpMsg: 'infothequecore-field-description-help'
				),
				new FieldDefinition(
					key: 'serial',
					widget: FieldWidget::Textarea,
					labelMsg: 'infothequecore-field-serial',
					helpMsg: 'infothequecore-field-serial-help',
					mergeIntoKey: 'description',
					lineWrap: '<div class="ith-dl-serialbox">%s</div>'
				),
				new FieldDefinition(
					key: 'format',
					widget: FieldWidget::Select,
					labelMsg: 'infothequecore-field-format-media',
					helpMsg: 'infothequecore-field-format-media-help',
					options: self::supportOptions()
				),
				new FieldDefinition(
					key: 'image',
					widget: FieldWidget::File,
					labelMsg: 'infothequecore-field-image',
					wikitextWrap: '[[Fichier:%s|centré|vignette|150x150px]]'
				),
				new FieldDefinition(
					key: 'liens',
					widget: FieldWidget::Links,
					labelMsg: 'infothequecore-field-liens',
					required: true,
					helpMsg: 'infothequecore-field-liens-help'
				),
			],
			rowKeyField: 'edition'
		);
	}

	/**
	 * Support icons, mirroring the existing "+ Ajouter un téléchargement"
	 * gadget's ITH_DL_FORMATS table (MediaWiki:Common.js) so both stay
	 * visually consistent.
	 *
	 * @return list<array{key:string,label:string,wikitext:string}>
	 */
	private static function supportOptions(): array {
		return [
			[
				'key' => 'disquette',
				'label' => 'Disquette',
				'wikitext' => '[[Fichier:Icône disquettes.png|centré]]',
			],
			[
				'key' => 'disquette2',
				'label' => 'Disquette (variante)',
				'wikitext' => '[[Fichier:Setupapi.dll 14 105.png|centré|sans_cadre]]',
			],
			[
				'key' => 'cd',
				'label' => 'CD-ROM / DVD',
				'wikitext' => '[[Fichier:Icone CD.png|centré|sans_cadre]]',
			],
			[
				'key' => 'cddisquette',
				'label' => 'CD + disquettes',
				'wikitext' => '[[Fichier:Mmcndmgr.dll 14 30548-1.png|centré|sans_cadre]]',
			],
			[
				'key' => 'zip',
				'label' => 'Fichier ZIP / téléchargement numérique',
				'wikitext' => '[[Fichier:Zipfldr.dll 14 123-3.png|centré|sans_cadre]]',
			],
			[
				'key' => 'installateur',
				'label' => 'Installateur (.exe)',
				'wikitext' => '[[Fichier:Netsetup.exe 14 3000-0.png|centré|sans_cadre]]',
			],
		];
	}

	private static function manuels(): FormSchema {
		return new FormSchema(
			id: 'manuels',
			labelMsg: 'infothequecore-form-manuels',
			templateName: 'Téléchargements',
			titleFields: [
				new FieldDefinition(
					key: 'titre',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-titre',
					helpMsg: 'infothequecore-field-titre-help',
					example: 'Documentation'
				),
			],
			rowFields: [
				new FieldDefinition(
					key: 'edition',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-nom-document',
					required: true,
					example: 'Manuel utilisateur'
				),
				new FieldDefinition(
					key: 'version',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-edition-document',
					example: '2ᵉ édition, 2001'
				),
				new FieldDefinition(
					key: 'langue',
					widget: FieldWidget::Combobox,
					labelMsg: 'infothequecore-field-langue',
					suggestedValues: [ 'Français', 'Anglais', 'Multilingue' ]
				),
				new FieldDefinition(
					key: 'description',
					widget: FieldWidget::Textarea,
					labelMsg: 'infothequecore-field-description',
					helpMsg: 'infothequecore-field-description-help'
				),
				new FieldDefinition(
					key: 'format',
					widget: FieldWidget::File,
					labelMsg: 'infothequecore-field-format-document',
					helpMsg: 'infothequecore-field-format-document-help',
					wikitextWrap: '[[Fichier:%s|centré]]'
				),
				new FieldDefinition(
					key: 'liens',
					widget: FieldWidget::Textarea,
					labelMsg: 'infothequecore-field-liens',
					required: true,
					helpMsg: 'infothequecore-field-liens-help',
					rawWikitext: true
				),
			],
			rowKeyField: 'edition'
		);
	}

	private static function configurations(): FormSchema {
		return new FormSchema(
			id: 'configurations',
			labelMsg: 'infothequecore-form-configurations',
			templateName: 'Configurations',
			titleFields: [
				new FieldDefinition(
					key: 'titre',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-titre',
					example: 'Configurations proposées'
				),
			],
			rowFields: [
				new FieldDefinition(
					key: 'variante',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-variante',
					required: true,
					example: 'VEi 8 (Pentium II)'
				),
				new FieldDefinition(
					key: 'processeur',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-processeur',
					example: '350 MHz ou 400 MHz'
				),
				new FieldDefinition(
					key: 'ram',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-ram',
					example: '32 Mo'
				),
				new FieldDefinition(
					key: 'stockage',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-stockage'
				),
				new FieldDefinition(
					key: 'graphics',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-graphics'
				),
				new FieldDefinition(
					key: 'autres',
					widget: FieldWidget::Textarea,
					labelMsg: 'infothequecore-field-autres'
				),
			],
			rowKeyField: 'variante'
		);
	}

	private static function pilotes(): FormSchema {
		return new FormSchema(
			id: 'pilotes',
			labelMsg: 'infothequecore-form-pilotes',
			templateName: 'Pilotes',
			titleFields: [],
			rowFields: [
				new FieldDefinition(
					key: 'nom',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-nom-pilote',
					required: true,
					example: 'Pilote graphique Matrox G200'
				),
				new FieldDefinition(
					key: 'type',
					widget: FieldWidget::Combobox,
					labelMsg: 'infothequecore-field-type-pilote',
					suggestedValues: [ 'Chipset', 'Graphique', 'Son', 'Réseau', 'Modem', 'Stockage', 'Autre' ]
				),
				new FieldDefinition(
					key: 'os',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-os-pilote',
					example: 'Windows 95/98'
				),
				new FieldDefinition(
					key: 'version',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-version'
				),
				new FieldDefinition(
					key: 'date',
					widget: FieldWidget::Text,
					labelMsg: 'infothequecore-field-date-pilote',
					example: '1999'
				),
				new FieldDefinition(
					key: 'fichier',
					widget: FieldWidget::File,
					labelMsg: 'infothequecore-field-fichier-pilote',
					helpMsg: 'infothequecore-field-fichier-pilote-help'
					// Not required: the live TemplateData only marks "nom" as
					// required. No wikitextWrap either: Pilotes takes the bare
					// file name, unlike Téléchargements' format/image which
					// need a full [[Fichier:]] link.
				),
			],
			rowKeyField: 'nom'
		);
	}
}
