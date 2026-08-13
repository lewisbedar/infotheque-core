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
 */
class WikitextGenerator {

	/** Number of row slots rendered in the form (Phase 5 makes this dynamic). */
	public const MAX_ROWS = 10;

	/**
	 * @param FormSchema $schema
	 * @param array<string,string> $data Field values keyed as returned by
	 *   HTMLForm: title field keys as-is, row field keys as "row{n}_{key}".
	 */
	public function generate( FormSchema $schema, array $data ): string {
		$lines = [ '{{' . $schema->templateName ];

		foreach ( $schema->titleFields as $field ) {
			$value = trim( $data[$field->key] ?? '' );
			if ( $value !== '' ) {
				$lines[] = ' |' . $field->key . '=' . $field->toWikitext( $value );
			}
		}

		$rowNumber = 1;
		foreach ( $this->usedSlots( $schema, $data ) as $slot ) {
			foreach ( $schema->rowFields as $field ) {
				$value = trim( $data[ 'row' . $slot . '_' . $field->key ] ?? '' );
				if ( $value === '' ) {
					continue;
				}
				$lines[] = ' |' . $field->key . $rowNumber . '=' . $field->toWikitext( $value );
			}
			$rowNumber++;
		}

		$lines[] = '}}';
		return implode( "\n", $lines );
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
