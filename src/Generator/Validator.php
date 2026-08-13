<?php

namespace MediaWiki\Extension\InfothequeCore\Generator;

use MediaWiki\Extension\InfothequeCore\Schema\FormSchema;

/**
 * Structural validation for submitted form data, run before a preview is
 * generated. Checks are limited to what the assistant's own schemas can
 * express (at least one row, required fields on rows actually in use) —
 * the Infobox-specific SMW pitfalls from the project brief (piped links
 * breaking Page-type properties) don't apply here since Infobox forms are
 * out of scope for this extension.
 */
class Validator {

	/**
	 * @param FormSchema $schema
	 * @param array<string,string> $titleValues
	 * @param list<array<string,string>> $rowsValues
	 * @return ValidationMessage[]
	 */
	public function validate( FormSchema $schema, array $titleValues, array $rowsValues ): array {
		$messages = [];
		$usedRows = ( new WikitextGenerator() )->usedRows( $schema, $rowsValues );

		if ( $usedRows === [] ) {
			$messages[] = new ValidationMessage(
				ValidationMessage::ERROR,
				wfMessage( 'infothequecore-error-no-rows' )->text()
			);
			return $messages;
		}

		foreach ( $usedRows as $index => $row ) {
			foreach ( $schema->rowFields as $field ) {
				if ( !$field->required ) {
					continue;
				}
				$value = trim( $row[ $field->key ] ?? '' );
				if ( $value === '' ) {
					$messages[] = new ValidationMessage(
						ValidationMessage::ERROR,
						wfMessage(
							'infothequecore-error-field-required',
							$index + 1,
							wfMessage( $field->labelMsg )->text()
						)->text()
					);
				}
			}
		}

		return $messages;
	}
}
