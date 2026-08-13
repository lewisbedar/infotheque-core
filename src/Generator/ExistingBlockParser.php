<?php

namespace MediaWiki\Extension\InfothequeCore\Generator;

use MediaWiki\Extension\InfothequeCore\Schema\FieldDefinition;
use MediaWiki\Extension\InfothequeCore\Schema\FieldWidget;
use MediaWiki\Extension\InfothequeCore\Schema\FormSchema;

/**
 * Reverse of WikitextGenerator: given the raw wikitext of a
 * {{Modèle:...}} call the editor-insertion bridge found already on the
 * page (see ext.infothequeCore.editorButton.js), extracts its current
 * values so the form can be pre-filled for editing. Kept server-side so
 * the escaping/wrapping conventions (FieldDefinition::toWikitext()) have
 * a single reverse counterpart here instead of being duplicated in JS.
 */
class ExistingBlockParser {

	/**
	 * @param FormSchema $schema
	 * @param string $raw Raw wikitext, expected to start with
	 *   "{{TemplateName" and end with "}}".
	 * @return array{title: array<string,string>, rows: list<array<string,string>>}|null
	 *   Null if $raw doesn't look like a call to $schema->templateName.
	 */
	public function parse( FormSchema $schema, string $raw ): ?array {
		$raw = trim( $raw );
		$prefix = '{{' . $schema->templateName;
		if ( !str_starts_with( $raw, $prefix ) || !str_ends_with( $raw, '}}' ) ) {
			return null;
		}
		$inner = substr( $raw, strlen( $prefix ), -2 );

		$fieldsByKey = [];
		foreach ( $schema->titleFields as $field ) {
			$fieldsByKey[ $field->key ] = $field;
		}
		foreach ( $schema->rowFields as $field ) {
			$fieldsByKey[ $field->key ] = $field;
		}

		$title = [];
		$rowsByNumber = [];

		foreach ( preg_split( '/\n\s*\|/', $inner ) as $chunk ) {
			$chunk = ltrim( $chunk, "|\n\r\t " );
			$eq = strpos( $chunk, '=' );
			if ( $chunk === '' || $eq === false ) {
				continue;
			}
			$paramName = trim( substr( $chunk, 0, $eq ) );
			$rawValue = trim( substr( $chunk, $eq + 1 ) );
			if ( $rawValue === '' ) {
				continue;
			}

			if ( preg_match( '/^([a-zA-Z]+)(\d+)$/', $paramName, $m ) ) {
				[ , $key, $rowNumber ] = $m;
				if ( !isset( $fieldsByKey[ $key ] ) ) {
					continue;
				}
				$rowsByNumber[ (int)$rowNumber ][ $key ] = $this->reverseTransform( $fieldsByKey[ $key ], $rawValue );
			} elseif ( isset( $fieldsByKey[ $paramName ] ) ) {
				$title[ $paramName ] = $this->reverseTransform( $fieldsByKey[ $paramName ], $rawValue );
			}
		}

		$this->extractMergedFields( $schema, $rowsByNumber );

		ksort( $rowsByNumber );
		return [ 'title' => $title, 'rows' => array_values( $rowsByNumber ) ];
	}

	/**
	 * Fields with $mergeIntoKey don't have their own "|key{n}=" param — on
	 * generation their value gets folded into another field's value (e.g. a
	 * serial-number field appended into "description"). To pre-fill them
	 * back out, pull out the segments matching their $lineWrap template from
	 * the target field's already-reverse-transformed value.
	 *
	 * @param FormSchema $schema
	 * @param array<int,array<string,string>> &$rowsByNumber
	 */
	private function extractMergedFields( FormSchema $schema, array &$rowsByNumber ): void {
		foreach ( $schema->rowFields as $field ) {
			if ( $field->mergeIntoKey === null || $field->lineWrap === null ) {
				continue;
			}
			foreach ( $rowsByNumber as $rowNumber => $row ) {
				if ( !isset( $row[ $field->mergeIntoKey ] ) ) {
					continue;
				}
				[ $extracted, $remaining ] = $this->extractWrapped( $row[ $field->mergeIntoKey ], $field->lineWrap );
				if ( $extracted !== '' ) {
					$rowsByNumber[ $rowNumber ][ $field->key ] = $extracted;
				}
				$rowsByNumber[ $rowNumber ][ $field->mergeIntoKey ] = $remaining;
			}
		}
	}

	/**
	 * @param string $value
	 * @param string $template sprintf template with exactly one "%s".
	 * @return array{0: string, 1: string} Extracted lines (newline-joined)
	 *   and the remainder of $value with those segments removed.
	 */
	private function extractWrapped( string $value, string $template ): array {
		$parts = explode( '%s', $template, 2 );
		$pattern = '/' . preg_quote( $parts[0], '/' ) . '(.*?)' . preg_quote( $parts[1] ?? '', '/' ) . '/su';

		$extracted = [];
		if ( preg_match_all( $pattern, $value, $matches ) ) {
			$extracted = $matches[1];
			$value = preg_replace( $pattern, '', $value );
		}

		return [ trim( implode( "\n", $extracted ) ), trim( $value ) ];
	}

	private function reverseTransform( FieldDefinition $field, string $value ): string {
		if ( $field->widget === FieldWidget::File ) {
			if ( preg_match( '/^\[\[(?:Fichier|File)\s*:\s*(.*?)(?:\||\]\])/iu', $value, $m ) ) {
				return $m[1];
			}
			return preg_replace( '/^(Fichier|File)\s*:\s*/iu', '', $value );
		}

		if ( $field->widget === FieldWidget::Select ) {
			foreach ( $field->options as $option ) {
				if ( $option['wikitext'] === $value ) {
					return $option['key'];
				}
			}
			return $value; // no match: keep as the "autre" custom wikitext
		}

		if ( $field->widget === FieldWidget::Links ) {
			return $this->parseLinksToJson( $value );
		}

		if ( $field->rawWikitext ) {
			return $value;
		}
		return str_replace( '{{!}}', '|', $value );
	}

	/** Reverse of FieldDefinition::buildLinksWikitext(): "[url label]" lines (bulleted or not) → JSON. */
	private function parseLinksToJson( string $value ): string {
		$links = [];
		foreach ( preg_split( '/\r?\n/', $value ) as $line ) {
			$line = preg_replace( '/^\*\s*/', '', trim( $line ) );
			if ( preg_match( '/^\[(\S+)\s+(.*)\]$/', $line, $m ) ) {
				$links[] = [ 'url' => $m[1], 'label' => $m[2] ];
			}
		}
		return json_encode( $links, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
	}
}
