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

		ksort( $rowsByNumber );
		return [ 'title' => $title, 'rows' => array_values( $rowsByNumber ) ];
	}

	private function reverseTransform( FieldDefinition $field, string $value ): string {
		if ( $field->widget === FieldWidget::File ) {
			if ( preg_match( '/^\[\[(?:Fichier|File)\s*:\s*(.*?)(?:\||\]\])/iu', $value, $m ) ) {
				return $m[1];
			}
			return preg_replace( '/^(Fichier|File)\s*:\s*/iu', '', $value );
		}
		if ( $field->rawWikitext ) {
			return $value;
		}
		return str_replace( '{{!}}', '|', $value );
	}
}
