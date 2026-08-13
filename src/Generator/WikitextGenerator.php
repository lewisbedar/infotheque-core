<?php

namespace MediaWiki\Extension\InfothequeCore\Generator;

use MediaWiki\Extension\InfothequeCore\Schema\FormSchema;

/**
 * Turns submitted form data into the {{Modèle:...}} call the schema
 * describes. Rows are compacted: only rows whose key field (e.g.
 * "edition", "variante", "nom") is filled in are emitted, renumbered
 * contiguously from 1 — the target Lua modules stop at the first missing
 * numbered row, so gaps must not leak through as gaps in the output.
 *
 * collect() is the single source of truth (per-field values already run
 * through FieldDefinition::toWikitext(), so already escaped/wrapped);
 * generate() is just a text assembly on top of it. This structured shape
 * (title values + an ordered list of row values) is exactly what both
 * ExistingBlockParser::parse() produces and what the editor overlay's
 * dynamic row UI naturally works with — no flat "row{n}_{key}"/row-count
 * limit needed once HTMLForm isn't the caller.
 */
class WikitextGenerator {

	/**
	 * @param FormSchema $schema
	 * @param array<string,string> $titleValues Raw values keyed by title field key.
	 * @param list<array<string,string>> $rowsValues Raw values keyed by row field key, one entry per row.
	 */
	public function generate( FormSchema $schema, array $titleValues, array $rowsValues ): string {
		$structured = $this->collect( $schema, $titleValues, $rowsValues );
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
	 * @param array<string,string> $titleValues
	 * @param list<array<string,string>> $rowsValues
	 * @return array{title: array<string,string>, rows: list<array<string,string>>}
	 *   Non-empty title field values keyed by field key, and one entry per
	 *   used row (in submission order) keyed the same way. Values are
	 *   already wikitext-ready (escaped/wrapped).
	 */
	public function collect( FormSchema $schema, array $titleValues, array $rowsValues ): array {
		$title = [];
		foreach ( $schema->titleFields as $field ) {
			$value = trim( $titleValues[ $field->key ] ?? '' );
			if ( $value !== '' ) {
				$title[ $field->key ] = $field->toWikitext( $value );
			}
		}

		$rows = [];
		foreach ( $this->usedRows( $schema, $rowsValues ) as $rawRow ) {
			$row = [];
			foreach ( $schema->rowFields as $field ) {
				$value = trim( $rawRow[ $field->key ] ?? '' );
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
	 * @param list<array<string,string>> $rowsValues
	 * @return list<array<string,string>> Only the rows whose key field is filled in.
	 */
	public function usedRows( FormSchema $schema, array $rowsValues ): array {
		return array_values( array_filter(
			$rowsValues,
			static fn ( array $row ): bool => trim( $row[ $schema->rowKeyField ] ?? '' ) !== ''
		) );
	}
}
