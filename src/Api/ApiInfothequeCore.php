<?php

namespace MediaWiki\Extension\InfothequeCore\Api;

use MediaWiki\Api\ApiBase;
use MediaWiki\Extension\InfothequeCore\Generator\ExistingBlockParser;
use MediaWiki\Extension\InfothequeCore\Generator\Validator;
use MediaWiki\Extension\InfothequeCore\Generator\WikitextGenerator;
use MediaWiki\Extension\InfothequeCore\Schema\FormSchema;
use MediaWiki\Extension\InfothequeCore\Schema\SchemaRegistry;

/**
 * Backend for the editor overlay (ext.infothequeCore.editorButton.js):
 * generates/validates wikitext from submitted field values ("generate"),
 * and parses an existing {{Modèle:...}} block back into field values for
 * pre-filling ("parseexisting"). Deliberately an API module, not a
 * SpecialPage — API modules skip OutputPage's skin rendering entirely, so
 * none of the X-Frame-Options / HTMLForm single-submission issues that
 * blocked the previous approach apply here. Business logic (schemas,
 * escaping, validation, existing-block parsing) is untouched — only
 * reused from Schema/ and Generator/.
 */
class ApiInfothequeCore extends ApiBase {

	/** @inheritDoc */
	public function execute() {
		$user = $this->getUser();
		if ( !$user->isNamed() ) {
			$this->dieWithError( 'apierror-mustbeloggedin-generic', 'notloggedin' );
		}

		$params = $this->extractRequestParams();
		$schema = SchemaRegistry::get( $params['schema'] );
		if ( $schema === null ) {
			$this->dieWithError( [ 'apierror-badparameter', 'schema' ], 'badschema' );
		}

		try {
			if ( $params['op'] === 'parseexisting' ) {
				$this->doParseExisting( $schema, (string)$params['raw'] );
				return;
			}
			$this->doGenerate( $schema, (string)$params['title'], (string)$params['rows'] );
		} catch ( \Throwable $e ) {
			// Surface the real error to the caller instead of a bare 500, so
			// the browser console shows exactly what broke.
			$this->dieDebug( __METHOD__, get_class( $e ) . ': ' . $e->getMessage() );
		}
	}

	private function doParseExisting( FormSchema $schema, string $raw ): void {
		$parsed = ( new ExistingBlockParser() )->parse( $schema, $raw );
		$result = $this->getResult();
		$result->addValue( null, 'title', (object)( $parsed['title'] ?? [] ) );
		$result->addValue( null, 'rows', $parsed['rows'] ?? [] );
	}

	private function doGenerate( FormSchema $schema, string $titleJson, string $rowsJson ): void {
		$titleValues = $this->decodeAssoc( $titleJson );
		$rowsValues = $this->decodeRows( $rowsJson );

		$errors = array_filter(
			( new Validator() )->validate( $schema, $titleValues, $rowsValues ),
			static fn ( $m ) => $m->severity === 'error'
		);

		$result = $this->getResult();
		if ( $errors !== [] ) {
			$result->addValue( null, 'errors', array_map( static fn ( $m ) => $m->text, $errors ) );
			return;
		}

		$wikitext = ( new WikitextGenerator() )->generate( $schema, $titleValues, $rowsValues );
		$result->addValue( null, 'wikitext', $wikitext );
	}

	/** @return array<string,string> */
	private function decodeAssoc( string $json ): array {
		$decoded = json_decode( $json, true );
		return is_array( $decoded ) ? $decoded : [];
	}

	/** @return list<array<string,string>> */
	private function decodeRows( string $json ): array {
		$decoded = json_decode( $json, true );
		if ( !is_array( $decoded ) ) {
			return [];
		}
		return array_values( array_filter( $decoded, 'is_array' ) );
	}

	/** @inheritDoc */
	public function getAllowedParams() {
		return [
			'op' => [
				ApiBase::PARAM_TYPE => [ 'generate', 'parseexisting' ],
				ApiBase::PARAM_REQUIRED => true,
			],
			'schema' => [
				ApiBase::PARAM_TYPE => 'string',
				ApiBase::PARAM_REQUIRED => true,
			],
			'title' => [
				ApiBase::PARAM_TYPE => 'string',
				ApiBase::PARAM_DEFAULT => '{}',
			],
			'rows' => [
				ApiBase::PARAM_TYPE => 'string',
				ApiBase::PARAM_DEFAULT => '[]',
			],
			'raw' => [
				ApiBase::PARAM_TYPE => 'string',
				ApiBase::PARAM_DEFAULT => '',
			],
		];
	}

	/** @inheritDoc */
	public function isInternal() {
		return true;
	}

	/** @inheritDoc */
	public function isWriteMode() {
		return false;
	}

	/** @inheritDoc */
	public function needsToken() {
		return false;
	}

	/** @inheritDoc */
	public function mustBePosted() {
		return true;
	}
}
