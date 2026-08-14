<?php

namespace MediaWiki\Extension\InfothequeCore\Api;

use ApiBase;
use MediaWiki\Extension\InfothequeCore\Generator\ExistingBlockParser;
use MediaWiki\Extension\InfothequeCore\Generator\Validator;
use MediaWiki\Extension\InfothequeCore\Generator\WikitextGenerator;
use MediaWiki\Extension\InfothequeCore\Schema\FormSchema;
use MediaWiki\Extension\InfothequeCore\Schema\SchemaRegistry;
use Wikimedia\ParamValidator\ParamValidator;

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
 *
 * Param definitions use Wikimedia\ParamValidator\ParamValidator, not the
 * older ApiBase::PARAM_* constants — this MediaWiki 1.46 install no
 * longer resolves those (same pattern as Html/Linker/ParserOptions
 * losing their global aliases; confirmed by bisection: action=paraminfo,
 * which never calls execute(), failed until this switch).
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
			// Not named "errors": mw.Api reserves that top-level key for
			// MediaWiki's own API error format ({"errors":[{code,text,...}]})
			// and routes any response carrying it to .fail() instead of
			// .done(), regardless of HTTP status — colliding with it here
			// silently misrouted every validation error to the JS's generic
			// failure handler.
			$result->addValue( null, 'validationErrors', array_map( static fn ( $m ) => $m->text, $errors ) );
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
				ParamValidator::PARAM_TYPE => [ 'generate', 'parseexisting' ],
				ParamValidator::PARAM_REQUIRED => true,
			],
			'schema' => [
				ParamValidator::PARAM_TYPE => 'string',
				ParamValidator::PARAM_REQUIRED => true,
			],
			'title' => [
				ParamValidator::PARAM_TYPE => 'string',
				ParamValidator::PARAM_DEFAULT => '{}',
			],
			'rows' => [
				ParamValidator::PARAM_TYPE => 'string',
				ParamValidator::PARAM_DEFAULT => '[]',
			],
			'raw' => [
				ParamValidator::PARAM_TYPE => 'string',
				ParamValidator::PARAM_DEFAULT => '',
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
