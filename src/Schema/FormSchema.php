<?php

namespace MediaWiki\Extension\InfothequeCore\Schema;

/**
 * Describes one of the assistant's forms: which wikitext template it
 * targets, its non-repeating fields, and the fields repeated once per row.
 */
class FormSchema {

	/**
	 * @param string $id
	 * @param string $labelMsg
	 * @param string $templateName Target page under Modèle: (without the namespace prefix).
	 * @param FieldDefinition[] $titleFields Non-repeating fields (e.g. "titre").
	 * @param FieldDefinition[] $rowFields Fields repeated once per numbered row.
	 * @param string $rowKeyField Key (within $rowFields) whose presence marks
	 *   a row as used; matches the field the underlying Lua module stops on
	 *   (e.g. "edition", "variante", "nom").
	 */
	public function __construct(
		public readonly string $id,
		public readonly string $labelMsg,
		public readonly string $templateName,
		public readonly array $titleFields,
		public readonly array $rowFields,
		public readonly string $rowKeyField
	) {
	}
}
