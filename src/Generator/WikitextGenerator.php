<?php

namespace MediaWiki\Extension\InfothequeCore\Generator;

use MediaWiki\Extension\InfothequeCore\Schema\FormSchema;

/**
 * Turns submitted form data into the {{Modèle:...}} call the schema
 * describes. Rows are compacted: only rows whose key field (e.g.
 * "edition", "variante", "nom") is filled in are emitted, renumbered
 * contiguously from 1 — the target Lua modules stop at the first missing
 * numbered row, so gaps left by empty rows in the form must not leak
 * through as gaps in the output.
 *
 * collect() is the single source of truth (per-field values already run
 * through FieldDefinition::toWikitext(), so already escaped/wrapped);
 * generate() is just a text assembly on top of it. The editor-insertion
 * bridge (ext.infothequeCore.editorButton.js) consumes the structured
 * form directly instead of re-deriving it from generated text.
 */
class WikitextGenerator {

	/**
	 * Number of row slots rendered in the form. 20 matches the row count
	 * Modèle:Téléchargements pre-declares in its own TemplateData for
	 * VisualEditor, so pre-filling a page with a long download history
	 * doesn't lose rows. True dynamic add/remove is a later enhancement.
	 */
	public const MAX_ROWS = 20;

	/**
	 * @param FormSchema $schema
	 * @param array<string,string> $data Field values keyed as returned by
	 *   HTMLForm: title field keys as-is, row field keys as "row{n}_{key}".
	 */
	public function generate( FormSchema $schema, array $data ): string {
		$structured = $this->collect( $schema, $data );
		$lines = [ '{{' . $schema->templateName ];

		foreach ( $structured['title'] as $key => $value ) {
			$lines[] = ' |' . $key . '=' . $value;
		}

		$rowNumber = 1;
		foreach ( $structured['rows'] as $row ) {
			foreach ( $row as $key => $value ) {
				$lines[] = ' |' . $key . $rowNumber . '=' . $value;
			}
			$rowNumber++;
		}

		$lines[] = '}}';
		return implode( "\n", $lines );
	}

	/**
	 * @param FormSchema $schema
	 * @param array<string,string> $data
	 * @return array{title: array<string,string>, rows: list<array<string,string>>}
	 *   Non-empty title field values keyed by field key, and one entry per
	 *   used row (in submission order) keyed the same way. Values are
	 *   already wikitext-ready (escaped/wrapped).
	 */
	public function collect( FormSchema $schema, array $data ): array {
		$title = [];
		foreach ( $schema->titleFields as $field ) {
			$value = trim( $data[ $field->key ] ?? '' );
			if ( $value !== '' ) {
				$title[ $field->key ] = $field->toWikitext( $value );
			}
		}

		$rows = [];
		foreach ( $this->usedSlots( $schema, $data ) as $slot ) {
			$row = [];
			foreach ( $schema->rowFields as $field ) {
				$value = trim( $data[ 'row' . $slot . '_' . $field->key ] ?? '' );
				if ( $value === '' ) {
					continue;
				}
				$row[ $field->key ] = $field->toWikitext( $value );
			}
			$rows[] = $row;
		}

		return [ 'title' => $title, 'rows' => $rows ];
	}

	/**
	 * @param FormSchema $schema
	 * @param array<string,string> $data
	 * @return int[] Form slot numbers (1..MAX_ROWS) whose key field is filled in.
	 */
	public function usedSlots( FormSchema $schema, array $data ): array {
		$slots = [];
		for ( $slot = 1; $slot <= self::MAX_ROWS; $slot++ ) {
			if ( trim( $data[ 'row' . $slot . '_' . $schema->rowKeyField ] ?? '' ) !== '' ) {
				$slots[] = $slot;
			}
		}
		return $slots;
	}
}
