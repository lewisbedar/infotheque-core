<?php

namespace MediaWiki\Extension\InfothequeCore;

use MediaWiki\Extension\InfothequeCore\Schema\FieldDefinition;
use MediaWiki\Extension\InfothequeCore\Schema\FieldWidget;
use MediaWiki\Extension\InfothequeCore\Schema\SchemaRegistry;

/**
 * Converts the PHP schema definitions (Schema/SchemaRegistry) into plain,
 * JSON-serializable arrays for the editor overlay
 * (ext.infothequeCore.editorButton.js). Labels/help are already resolved
 * via wfMessage() here, so the JS needs no i18n knowledge of its own —
 * it just renders whatever declarative field list it receives.
 */
class SchemaExporter {

	/** @return array<string,array> Keyed by schema id. */
	public static function exportAll(): array {
		$out = [];
		foreach ( SchemaRegistry::all() as $id => $schema ) {
			$out[ $id ] = [
				'id' => $schema->id,
				'label' => wfMessage( $schema->labelMsg )->text(),
				'templateName' => $schema->templateName,
				'rowKeyField' => $schema->rowKeyField,
				'titleFields' => array_map( [ self::class, 'exportField' ], $schema->titleFields ),
				'rowFields' => array_map( [ self::class, 'exportField' ], $schema->rowFields ),
			];
		}
		return $out;
	}

	private static function exportField( FieldDefinition $field ): array {
		return [
			'key' => $field->key,
			'widget' => self::widgetName( $field->widget ),
			'label' => wfMessage( $field->labelMsg )->text(),
			'help' => $field->helpMsg !== null ? wfMessage( $field->helpMsg )->text() : null,
			'required' => $field->required,
			'suggestedValues' => $field->suggestedValues,
			'example' => $field->example,
			'allowUpload' => $field->allowUpload,
			'multiple' => $field->multiple,
			// Select only; strip the server-only "wikitext" value, the
			// client just needs key+label to build <option> elements.
			'options' => array_map(
				static fn ( array $o ): array => [ 'key' => $o['key'], 'label' => $o['label'] ],
				$field->options
			),
		];
	}

	private static function widgetName( FieldWidget $widget ): string {
		switch ( $widget ) {
			case FieldWidget::Textarea:
				return 'textarea';
			case FieldWidget::Combobox:
				return 'combobox';
			case FieldWidget::File:
				return 'file';
			case FieldWidget::Select:
				return 'select';
			case FieldWidget::MultiSelect:
				return 'multiselect';
			case FieldWidget::Links:
				return 'links';
			case FieldWidget::Text:
			default:
				return 'text';
		}
	}
}
