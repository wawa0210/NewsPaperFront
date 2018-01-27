

( function() {
	'use strict';

	var DTD = CKEDITOR.dtd,
		// processElement flag - means that element has been somehow modified.
		FILTER_ELEMENT_MODIFIED = 1,
		// processElement flag - meaning explained in CKEDITOR.FILTER_SKIP_TREE doc.
		FILTER_SKIP_TREE = 2,
		copy = CKEDITOR.tools.copy,
		trim = CKEDITOR.tools.trim,
		TEST_VALUE = 'cke-test',
		enterModeTags = [ '', 'p', 'br', 'div' ];

	
	CKEDITOR.FILTER_SKIP_TREE = FILTER_SKIP_TREE;

	
	CKEDITOR.filter = function( editorOrRules ) {
		

		
		this.allowedContent = [];

		
		this.disallowedContent = [];

		
		this.elementCallbacks = null;

		
		this.disabled = false;

		
		this.editor = null;

		
		this.id = CKEDITOR.tools.getNextNumber();

		this._ = {
			// Optimized allowed content rules.
			allowedRules: {
				elements: {},
				generic: []
			},
			// Optimized disallowed content rules.
			disallowedRules: {
				elements: {},
				generic: []
			},
			// Object: element name => array of transformations groups.
			transformations: {},
			cachedTests: {}
		};

		// Register filter instance.
		CKEDITOR.filter.instances[ this.id ] = this;

		if ( editorOrRules instanceof CKEDITOR.editor ) {
			var editor = this.editor = editorOrRules;
			this.customConfig = true;

			var allowedContent = editor.config.allowedContent;

			// Disable filter completely by setting config.allowedContent = true.
			if ( allowedContent === true ) {
				this.disabled = true;
				return;
			}

			if ( !allowedContent )
				this.customConfig = false;

			this.allow( allowedContent, 'config', 1 );
			this.allow( editor.config.extraAllowedContent, 'extra', 1 );

			// Enter modes should extend filter rules (ENTER_P adds 'p' rule, etc.).
			this.allow( enterModeTags[ editor.enterMode ] + ' ' + enterModeTags[ editor.shiftEnterMode ], 'default', 1 );

			this.disallow( editor.config.disallowedContent );
		}
		// Rules object passed in editorOrRules argument - initialize standalone filter.
		else {
			this.customConfig = false;
			this.allow( editorOrRules, 'default', 1 );
		}
	};

	
	CKEDITOR.filter.instances = {};

	CKEDITOR.filter.prototype = {
		
		allow: function( newRules, featureName, overrideCustom ) {
			// Check arguments and constraints. Clear cache.
			if ( !beforeAddingRule( this, newRules, overrideCustom ) )
				return false;

			var i, ret;

			if ( typeof newRules == 'string' )
				newRules = parseRulesString( newRules );
			else if ( newRules instanceof CKEDITOR.style ) {
				// If style has the cast method defined, use it and abort.
				if ( newRules.toAllowedContentRules )
					return this.allow( newRules.toAllowedContentRules( this.editor ), featureName, overrideCustom );

				newRules = convertStyleToRules( newRules );
			} else if ( CKEDITOR.tools.isArray( newRules ) ) {
				for ( i = 0; i < newRules.length; ++i )
					ret = this.allow( newRules[ i ], featureName, overrideCustom );
				return ret; // Return last status.
			}

			addAndOptimizeRules( this, newRules, featureName, this.allowedContent, this._.allowedRules );

			return true;
		},

		
		applyTo: function( fragment, toHtml, transformOnly, enterMode ) {
			if ( this.disabled )
				return false;

			var that = this,
				toBeRemoved = [],
				protectedRegexs = this.editor && this.editor.config.protectedSource,
				processRetVal,
				isModified = false,
				filterOpts = {
					doFilter: !transformOnly,
					doTransform: true,
					doCallbacks: true,
					toHtml: toHtml
				};

			// Filter all children, skip root (fragment or editable-like wrapper used by data processor).
			fragment.forEach( function( el ) {
				if ( el.type == CKEDITOR.NODE_ELEMENT ) {
					// Do not filter element with data-cke-filter="off" and all their descendants.
					if ( el.attributes[ 'data-cke-filter' ] == 'off' )
						return false;

					// (#10260) Don't touch elements like spans with data-cke-* attribute since they're
					// responsible e.g. for placing markers, bookmarks, odds and stuff.
					// We love 'em and we don't wanna lose anything during the filtering.
					// '|' is to avoid tricky joints like data-="foo" + cke-="bar". Yes, they're possible.
					//
					// NOTE: data-cke-* assigned elements are preserved only when filter is used with
					//       htmlDataProcessor.toHtml because we don't want to protect them when outputting data
					//       (toDataFormat).
					if ( toHtml && el.name == 'span' && ~CKEDITOR.tools.objectKeys( el.attributes ).join( '|' ).indexOf( 'data-cke-' ) )
						return;

					processRetVal = processElement( that, el, toBeRemoved, filterOpts );
					if ( processRetVal & FILTER_ELEMENT_MODIFIED )
						isModified = true;
					else if ( processRetVal & FILTER_SKIP_TREE )
						return false;
				}
				else if ( el.type == CKEDITOR.NODE_COMMENT && el.value.match( /^\{cke_protected\}(?!\{C\})/ ) ) {
					if ( !processProtectedElement( that, el, protectedRegexs, filterOpts ) )
						toBeRemoved.push( el );
				}
			}, null, true );

			if ( toBeRemoved.length )
				isModified = true;

			var node, element, check,
				toBeChecked = [],
				enterTag = enterModeTags[ enterMode || ( this.editor ? this.editor.enterMode : CKEDITOR.ENTER_P ) ],
				parentDtd;

			// Remove elements in reverse order - from leaves to root, to avoid conflicts.
			while ( ( node = toBeRemoved.pop() ) ) {
				if ( node.type == CKEDITOR.NODE_ELEMENT )
					removeElement( node, enterTag, toBeChecked );
				// This is a comment securing rejected element - remove it completely.
				else
					node.remove();
			}

			// Check elements that have been marked as possibly invalid.
			while ( ( check = toBeChecked.pop() ) ) {
				element = check.el;
				// Element has been already removed.
				if ( !element.parent )
					continue;

				// Handle custom elements as inline elements (#12683).
				parentDtd = DTD[ element.parent.name ] || DTD.span;

				switch ( check.check ) {
					// Check if element itself is correct.
					case 'it':
						// Check if element included in $removeEmpty has no children.
						if ( DTD.$removeEmpty[ element.name ] && !element.children.length )
							removeElement( element, enterTag, toBeChecked );
						// Check if that is invalid element.
						else if ( !validateElement( element ) )
							removeElement( element, enterTag, toBeChecked );
						break;

					// Check if element is in correct context. If not - remove element.
					case 'el-up':
						// Check if e.g. li is a child of body after ul has been removed.
						if ( element.parent.type != CKEDITOR.NODE_DOCUMENT_FRAGMENT && !parentDtd[ element.name ] )
							removeElement( element, enterTag, toBeChecked );
						break;

					// Check if element is in correct context. If not - remove parent.
					case 'parent-down':
						if ( element.parent.type != CKEDITOR.NODE_DOCUMENT_FRAGMENT && !parentDtd[ element.name ] )
							removeElement( element.parent, enterTag, toBeChecked );
						break;
				}
			}

			return isModified;
		},

		
		checkFeature: function( feature ) {
			if ( this.disabled )
				return true;

			if ( !feature )
				return true;

			// Some features may want to register other features.
			// E.g. a button may return a command bound to it.
			if ( feature.toFeature )
				feature = feature.toFeature( this.editor );

			return !feature.requiredContent || this.check( feature.requiredContent );
		},

		
		disable: function() {
			this.disabled = true;
		},

		
		disallow: function( newRules ) {
			// Check arguments and constraints. Clear cache.
			// Note: we pass true in the 3rd argument, because disallow() should never
			// be blocked by custom configuration.
			if ( !beforeAddingRule( this, newRules, true ) )
				return false;

			if ( typeof newRules == 'string' )
				newRules = parseRulesString( newRules );

			addAndOptimizeRules( this, newRules, null, this.disallowedContent, this._.disallowedRules );

			return true;
		},

		
		addContentForms: function( forms ) {
			if ( this.disabled )
				return;

			if ( !forms )
				return;

			var i, form,
				transfGroups = [],
				preferredForm;

			// First, find preferred form - this is, first allowed.
			for ( i = 0; i < forms.length && !preferredForm; ++i ) {
				form = forms[ i ];

				// Check only strings and styles - array format isn't supported by #check().
				if ( ( typeof form == 'string' || form instanceof CKEDITOR.style ) && this.check( form ) )
					preferredForm = form;
			}

			// This feature doesn't have preferredForm, so ignore it.
			if ( !preferredForm )
				return;

			for ( i = 0; i < forms.length; ++i )
				transfGroups.push( getContentFormTransformationGroup( forms[ i ], preferredForm ) );

			this.addTransformations( transfGroups );
		},

		
		addElementCallback: function( callback ) {
			// We want to keep it a falsy value, to speed up finding whether there are any callbacks.
			if ( !this.elementCallbacks )
				this.elementCallbacks = [];

			this.elementCallbacks.push( callback );
		},

		
		addFeature: function( feature ) {
			if ( this.disabled )
				return true;

			if ( !feature )
				return true;

			// Some features may want to register other features.
			// E.g. a button may return a command bound to it.
			if ( feature.toFeature )
				feature = feature.toFeature( this.editor );

			// If default configuration (will be checked inside #allow()),
			// then add allowed content rules.
			this.allow( feature.allowedContent, feature.name );

			this.addTransformations( feature.contentTransformations );
			this.addContentForms( feature.contentForms );

			// If custom configuration or any DACRs, then check if required content is allowed.
			if ( feature.requiredContent && ( this.customConfig || this.disallowedContent.length ) )
				return this.check( feature.requiredContent );

			return true;
		},

		
		addTransformations: function( transformations ) {
			if ( this.disabled )
				return;

			if ( !transformations )
				return;

			var optimized = this._.transformations,
				group, i;

			for ( i = 0; i < transformations.length; ++i ) {
				group = optimizeTransformationsGroup( transformations[ i ] );

				if ( !optimized[ group.name ] )
					optimized[ group.name ] = [];

				optimized[ group.name ].push( group.rules );
			}
		},

		
		check: function( test, applyTransformations, strictCheck ) {
			if ( this.disabled )
				return true;

			// If rules are an array, expand it and return the logical OR value of
			// the rules.
			if ( CKEDITOR.tools.isArray( test ) ) {
				for ( var i = test.length ; i-- ; ) {
					if ( this.check( test[ i ], applyTransformations, strictCheck ) )
						return true;
				}
				return false;
			}

			var element, result, cacheKey;

			if ( typeof test == 'string' ) {
				cacheKey = test + '<' + ( applyTransformations === false ? '0' : '1' ) + ( strictCheck ? '1' : '0' ) + '>';

				// Check if result of this check hasn't been already cached.
				if ( cacheKey in this._.cachedChecks )
					return this._.cachedChecks[ cacheKey ];

				// Create test element from string.
				element = mockElementFromString( test );
			} else {
				// Create test element from CKEDITOR.style.
				element = mockElementFromStyle( test );
			}

			// Make a deep copy.
			var clone = CKEDITOR.tools.clone( element ),
				toBeRemoved = [],
				transformations;

			// Apply transformations to original element.
			// Transformations will be applied to clone by the filter function.
			if ( applyTransformations !== false && ( transformations = this._.transformations[ element.name ] ) ) {
				for ( i = 0; i < transformations.length; ++i )
					applyTransformationsGroup( this, element, transformations[ i ] );

				// Transformations could modify styles or classes, so they need to be copied
				// to attributes object.
				updateAttributes( element );
			}

			// Filter clone of mocked element.
			processElement( this, clone, toBeRemoved, {
				doFilter: true,
				doTransform: applyTransformations !== false,
				skipRequired: !strictCheck,
				skipFinalValidation: !strictCheck
			} );

			// Element has been marked for removal.
			if ( toBeRemoved.length > 0 ) {
				result = false;
			// Compare only left to right, because clone may be only trimmed version of original element.
			} else if ( !CKEDITOR.tools.objectCompare( element.attributes, clone.attributes, true ) ) {
				result = false;
			} else {
				result = true;
			}

			// Cache result of this test - we can build cache only for string tests.
			if ( typeof test == 'string' )
				this._.cachedChecks[ cacheKey ] = result;

			return result;
		},

		
		getAllowedEnterMode: ( function() {
			var tagsToCheck = [ 'p', 'div', 'br' ],
				enterModes = {
					p: CKEDITOR.ENTER_P,
					div: CKEDITOR.ENTER_DIV,
					br: CKEDITOR.ENTER_BR
				};

			return function( defaultMode, reverse ) {
				// Clone the array first.
				var tags = tagsToCheck.slice(),
					tag;

				// Check the default mode first.
				if ( this.check( enterModeTags[ defaultMode ] ) )
					return defaultMode;

				// If not reverse order, reverse array so we can pop() from it.
				if ( !reverse )
					tags = tags.reverse();

				while ( ( tag = tags.pop() ) ) {
					if ( this.check( tag ) )
						return enterModes[ tag ];
				}

				return CKEDITOR.ENTER_BR;
			};
		} )(),

		
		destroy: function() {
			delete CKEDITOR.filter.instances[ this.id ];
			// Deleting reference to filter instance should be enough,
			// but since these are big objects it's safe to clean them up too.
			delete this._;
			delete this.allowedContent;
			delete this.disallowedContent;
		}
	};

	function addAndOptimizeRules( that, newRules, featureName, standardizedRules, optimizedRules ) {
		var groupName, rule,
			rulesToOptimize = [];

		for ( groupName in newRules ) {
			rule = newRules[ groupName ];

			// { 'p h1': true } => { 'p h1': {} }.
			if ( typeof rule == 'boolean' )
				rule = {};
			// { 'p h1': func } => { 'p h1': { match: func } }.
			else if ( typeof rule == 'function' )
				rule = { match: rule };
			// Clone (shallow) rule, because we'll modify it later.
			else
				rule = copy( rule );

			// If this is not an unnamed rule ({ '$1' => { ... } })
			// move elements list to property.
			if ( groupName.charAt( 0 ) != '$' )
				rule.elements = groupName;

			if ( featureName )
				rule.featureName = featureName.toLowerCase();

			standardizeRule( rule );

			// Save rule and remember to optimize it.
			standardizedRules.push( rule );
			rulesToOptimize.push( rule );
		}

		optimizeRules( optimizedRules, rulesToOptimize );
	}

	// Apply ACR to an element.
	// @param rule
	// @param element
	// @param status Object containing status of element's filtering.
	// @param {Boolean} skipRequired If true don't check if element has all required properties.
	function applyAllowedRule( rule, element, status, skipRequired ) {
		// This rule doesn't match this element - skip it.
		if ( rule.match && !rule.match( element ) )
			return;

		// If element doesn't have all required styles/attrs/classes
		// this rule doesn't match it.
		if ( !skipRequired && !hasAllRequired( rule, element ) )
			return;

		// If this rule doesn't validate properties only mark element as valid.
		if ( !rule.propertiesOnly )
			status.valid = true;

		// Apply rule only when all attrs/styles/classes haven't been marked as valid.
		if ( !status.allAttributes )
			status.allAttributes = applyAllowedRuleToHash( rule.attributes, element.attributes, status.validAttributes );

		if ( !status.allStyles )
			status.allStyles = applyAllowedRuleToHash( rule.styles, element.styles, status.validStyles );

		if ( !status.allClasses )
			status.allClasses = applyAllowedRuleToArray( rule.classes, element.classes, status.validClasses );
	}

	// Apply itemsRule to items (only classes are kept in array).
	// Push accepted items to validItems array.
	// Return true when all items are valid.
	function applyAllowedRuleToArray( itemsRule, items, validItems ) {
		if ( !itemsRule )
			return false;

		// True means that all elements of array are accepted (the asterix was used for classes).
		if ( itemsRule === true )
			return true;

		for ( var i = 0, l = items.length, item; i < l; ++i ) {
			item = items[ i ];
			if ( !validItems[ item ] )
				validItems[ item ] = itemsRule( item );
		}

		return false;
	}

	function applyAllowedRuleToHash( itemsRule, items, validItems ) {
		if ( !itemsRule )
			return false;

		if ( itemsRule === true )
			return true;

		for ( var name in items ) {
			if ( !validItems[ name ] )
				validItems[ name ] = itemsRule( name );
		}

		return false;
	}

	// Apply DACR rule to an element.
	function applyDisallowedRule( rule, element, status ) {
		// This rule doesn't match this element - skip it.
		if ( rule.match && !rule.match( element ) )
			return;

		// No properties - it's an element only rule so it disallows entire element.
		// Early return is handled in filterElement.
		if ( rule.noProperties )
			return false;

		// Apply rule to attributes, styles and classes. Switch hadInvalid* to true if method returned true.
		status.hadInvalidAttribute = applyDisallowedRuleToHash( rule.attributes, element.attributes ) || status.hadInvalidAttribute;
		status.hadInvalidStyle = applyDisallowedRuleToHash( rule.styles, element.styles ) || status.hadInvalidStyle;
		status.hadInvalidClass = applyDisallowedRuleToArray( rule.classes, element.classes ) || status.hadInvalidClass;
	}

	// Apply DACR to items (only classes are kept in array).
	// @returns {Boolean} True if at least one of items was invalid (disallowed).
	function applyDisallowedRuleToArray( itemsRule, items ) {
		if ( !itemsRule )
			return false;

		var hadInvalid = false,
			allDisallowed = itemsRule === true;

		for ( var i = items.length; i--; ) {
			if ( allDisallowed || itemsRule( items[ i ] ) ) {
				items.splice( i, 1 );
				hadInvalid = true;
			}
		}

		return hadInvalid;
	}

	// Apply DACR to items (styles and attributes).
	// @returns {Boolean} True if at least one of items was invalid (disallowed).
	function applyDisallowedRuleToHash( itemsRule, items ) {
		if ( !itemsRule )
			return false;

		var hadInvalid = false,
			allDisallowed = itemsRule === true;

		for ( var name in items ) {
			if ( allDisallowed || itemsRule( name ) ) {
				delete items[ name ];
				hadInvalid = true;
			}
		}

		return hadInvalid;
	}

	function beforeAddingRule( that, newRules, overrideCustom ) {
		if ( that.disabled )
			return false;

		// Don't override custom user's configuration if not explicitly requested.
		if ( that.customConfig && !overrideCustom )
			return false;

		if ( !newRules )
			return false;

		// Clear cache, because new rules could change results of checks.
		that._.cachedChecks = {};

		return true;
	}

	// Convert CKEDITOR.style to filter's rule.
	function convertStyleToRules( style ) {
		var styleDef = style.getDefinition(),
			rules = {},
			rule,
			attrs = styleDef.attributes;

		rules[ styleDef.element ] = rule = {
			styles: styleDef.styles,
			requiredStyles: styleDef.styles && CKEDITOR.tools.objectKeys( styleDef.styles )
		};

		if ( attrs ) {
			attrs = copy( attrs );
			rule.classes = attrs[ 'class' ] ? attrs[ 'class' ].split( /\s+/ ) : null;
			rule.requiredClasses = rule.classes;
			delete attrs[ 'class' ];
			rule.attributes = attrs;
			rule.requiredAttributes = attrs && CKEDITOR.tools.objectKeys( attrs );
		}

		return rules;
	}

	// Convert all validator formats (string, array, object, boolean) to hash or boolean:
	// * true is returned for '*'/true validator,
	// * false is returned for empty validator (no validator at all (false/null) or e.g. empty array),
	// * object is returned in other cases.
	function convertValidatorToHash( validator, delimiter ) {
		if ( !validator )
			return false;

		if ( validator === true )
			return validator;

		if ( typeof validator == 'string' ) {
			validator = trim( validator );
			if ( validator == '*' )
				return true;
			else
				return CKEDITOR.tools.convertArrayToObject( validator.split( delimiter ) );
		}
		else if ( CKEDITOR.tools.isArray( validator ) ) {
			if ( validator.length )
				return CKEDITOR.tools.convertArrayToObject( validator );
			else
				return false;
		}
		// If object.
		else {
			var obj = {},
				len = 0;

			for ( var i in validator ) {
				obj[ i ] = validator[ i ];
				len++;
			}

			return len ? obj : false;
		}
	}

	function executeElementCallbacks( element, callbacks ) {
		for ( var i = 0, l = callbacks.length, retVal; i < l; ++i ) {
			if ( ( retVal = callbacks[ i ]( element ) ) )
				return retVal;
		}
	}

	// Extract required properties from "required" validator and "all" properties.
	// Remove exclamation marks from "all" properties.
	//
	// E.g.:
	// requiredClasses = { cl1: true }
	// (all) classes = { cl1: true, cl2: true, '!cl3': true }
	//
	// result:
	// returned = { cl1: true, cl3: true }
	// all = { cl1: true, cl2: true, cl3: true }
	//
	// This function returns false if nothing is required.
	function extractRequired( required, all ) {
		var unbang = [],
			empty = true,
			i;

		if ( required )
			empty = false;
		else
			required = {};

		for ( i in all ) {
			if ( i.charAt( 0 ) == '!' ) {
				i = i.slice( 1 );
				unbang.push( i );
				required[ i ] = true;
				empty = false;
			}
		}

		while ( ( i = unbang.pop() ) ) {
			all[ i ] = all[ '!' + i ];
			delete all[ '!' + i ];
		}

		return empty ? false : required;
	}

	// Does the actual filtering by appling allowed content rules
	// to the element.
	//
	// @param {CKEDITOR.filter} that The context.
	// @param {CKEDITOR.htmlParser.element} element
	// @param {Object} opts The same as in processElement.
	function filterElement( that, element, opts ) {
		var name = element.name,
			privObj = that._,
			allowedRules = privObj.allowedRules.elements[ name ],
			genericAllowedRules = privObj.allowedRules.generic,
			disallowedRules = privObj.disallowedRules.elements[ name ],
			genericDisallowedRules = privObj.disallowedRules.generic,
			skipRequired = opts.skipRequired,
			status = {
				// Whether any of rules accepted element.
				// If not - it will be stripped.
				valid: false,
				// Objects containing accepted attributes, classes and styles.
				validAttributes: {},
				validClasses: {},
				validStyles: {},
				// Whether all are valid.
				// If we know that all element's attrs/classes/styles are valid
				// we can skip their validation, to improve performance.
				allAttributes: false,
				allClasses: false,
				allStyles: false,
				// Whether element had (before applying DACRs) at least one invalid attribute/class/style.
				hadInvalidAttribute: false,
				hadInvalidClass: false,
				hadInvalidStyle: false
			},
			i, l;

		// Early return - if there are no rules for this element (specific or generic), remove it.
		if ( !allowedRules && !genericAllowedRules )
			return null;

		// Could not be done yet if there were no transformations and if this
		// is real (not mocked) object.
		populateProperties( element );

		// Note - this step modifies element's styles, classes and attributes.
		if ( disallowedRules ) {
			for ( i = 0, l = disallowedRules.length; i < l; ++i ) {
				// Apply rule and make an early return if false is returned what means
				// that element is completely disallowed.
				if ( applyDisallowedRule( disallowedRules[ i ], element, status ) === false )
					return null;
			}
		}

		// Note - this step modifies element's styles, classes and attributes.
		if ( genericDisallowedRules ) {
			for ( i = 0, l = genericDisallowedRules.length; i < l; ++i )
				applyDisallowedRule( genericDisallowedRules[ i ], element, status );
		}

		if ( allowedRules ) {
			for ( i = 0, l = allowedRules.length; i < l; ++i )
				applyAllowedRule( allowedRules[ i ], element, status, skipRequired );
		}

		if ( genericAllowedRules ) {
			for ( i = 0, l = genericAllowedRules.length; i < l; ++i )
				applyAllowedRule( genericAllowedRules[ i ], element, status, skipRequired );
		}

		return status;
	}

	// Check whether element has all properties (styles,classes,attrs) required by a rule.
	function hasAllRequired( rule, element ) {
		if ( rule.nothingRequired )
			return true;

		var i, req, reqs, existing;

		if ( ( reqs = rule.requiredClasses ) ) {
			existing = element.classes;
			for ( i = 0; i < reqs.length; ++i ) {
				req = reqs[ i ];
				if ( typeof req == 'string' ) {
					if ( CKEDITOR.tools.indexOf( existing, req ) == -1 )
						return false;
				}
				// This means regexp.
				else {
					if ( !CKEDITOR.tools.checkIfAnyArrayItemMatches( existing, req ) )
						return false;
				}
			}
		}

		return hasAllRequiredInHash( element.styles, rule.requiredStyles ) &&
			hasAllRequiredInHash( element.attributes, rule.requiredAttributes );
	}

	// Check whether all items in required (array) exist in existing (object).
	function hasAllRequiredInHash( existing, required ) {
		if ( !required )
			return true;

		for ( var i = 0, req; i < required.length; ++i ) {
			req = required[ i ];
			if ( typeof req == 'string' ) {
				if ( !( req in existing ) )
					return false;
			}
			// This means regexp.
			else {
				if ( !CKEDITOR.tools.checkIfAnyObjectPropertyMatches( existing, req ) )
					return false;
			}
		}

		return true;
	}

	// Create pseudo element that will be passed through filter
	// to check if tested string is allowed.
	function mockElementFromString( str ) {
		var element = parseRulesString( str ).$1,
			styles = element.styles,
			classes = element.classes;

		element.name = element.elements;
		element.classes = classes = ( classes ? classes.split( /\s*,\s*/ ) : [] );
		element.styles = mockHash( styles );
		element.attributes = mockHash( element.attributes );
		element.children = [];

		if ( classes.length )
			element.attributes[ 'class' ] = classes.join( ' ' );
		if ( styles )
			element.attributes.style = CKEDITOR.tools.writeCssText( element.styles );

		return element;
	}

	// Create pseudo element that will be passed through filter
	// to check if tested style is allowed.
	function mockElementFromStyle( style ) {
		var styleDef = style.getDefinition(),
			styles = styleDef.styles,
			attrs = styleDef.attributes || {};

		if ( styles && !CKEDITOR.tools.isEmpty( styles ) ) {
			styles = copy( styles );
			attrs.style = CKEDITOR.tools.writeCssText( styles, true );
		} else {
			styles = {};
		}

		return {
			name: styleDef.element,
			attributes: attrs,
			classes: attrs[ 'class' ] ? attrs[ 'class' ].split( /\s+/ ) : [],
			styles: styles,
			children: []
		};
	}

	// Mock hash based on string.
	// 'a,b,c' => { a: 'cke-test', b: 'cke-test', c: 'cke-test' }
	// Used to mock styles and attributes objects.
	function mockHash( str ) {
		// It may be a null or empty string.
		if ( !str )
			return {};

		var keys = str.split( /\s*,\s*/ ).sort(),
			obj = {};

		while ( keys.length )
			obj[ keys.shift() ] = TEST_VALUE;

		return obj;
	}

	// Extract properties names from the object
	// and replace those containing wildcards with regexps.
	// Note: there's a room for performance improvement. Array of mixed types
	// breaks JIT-compiler optiomization what may invalidate compilation of pretty a lot of code.
	//
	// @returns An array of strings and regexps.
	function optimizeRequiredProperties( requiredProperties ) {
		var arr = [];
		for ( var propertyName in requiredProperties ) {
			if ( propertyName.indexOf( '*' ) > -1 )
				arr.push( new RegExp( '^' + propertyName.replace( /\*/g, '.*' ) + '$' ) );
			else
				arr.push( propertyName );
		}
		return arr;
	}

	var validators = { styles: 1, attributes: 1, classes: 1 },
		validatorsRequired = {
			styles: 'requiredStyles',
			attributes: 'requiredAttributes',
			classes: 'requiredClasses'
		};

	// Optimize a rule by replacing validators with functions
	// and rewriting requiredXXX validators to arrays.
	function optimizeRule( rule ) {
		var validatorName,
			requiredProperties,
			i;

		for ( validatorName in validators )
			rule[ validatorName ] = validatorFunction( rule[ validatorName ] );

		var nothingRequired = true;
		for ( i in validatorsRequired ) {
			validatorName = validatorsRequired[ i ];
			requiredProperties = optimizeRequiredProperties( rule[ validatorName ] );
			// Don't set anything if there are no required properties. This will allow to
			// save some memory by GCing all empty arrays (requiredProperties).
			if ( requiredProperties.length ) {
				rule[ validatorName ] = requiredProperties;
				nothingRequired = false;
			}
		}

		rule.nothingRequired = nothingRequired;
		rule.noProperties = !( rule.attributes || rule.classes || rule.styles );
	}

	// Add optimized version of rule to optimizedRules object.
	function optimizeRules( optimizedRules, rules ) {
		var elementsRules = optimizedRules.elements,
			genericRules = optimizedRules.generic,
			i, l, rule, element, priority;

		for ( i = 0, l = rules.length; i < l; ++i ) {
			// Shallow copy. Do not modify original rule.
			rule = copy( rules[ i ] );
			priority = rule.classes === true || rule.styles === true || rule.attributes === true;
			optimizeRule( rule );

			// E.g. "*(xxx)[xxx]" - it's a generic rule that
			// validates properties only.
			// Or '$1': { match: function() {...} }
			if ( rule.elements === true || rule.elements === null ) {
				// Add priority rules at the beginning.
				genericRules[ priority ? 'unshift' : 'push' ]( rule );
			}
			// If elements list was explicitly defined,
			// add this rule for every defined element.
			else {
				// We don't need elements validator for this kind of rule.
				var elements = rule.elements;
				delete rule.elements;

				for ( element in elements ) {
					if ( !elementsRules[ element ] )
						elementsRules[ element ] = [ rule ];
					else
						elementsRules[ element ][ priority ? 'unshift' : 'push' ]( rule );
				}
			}
		}
	}

	//                  <   elements   ><                       styles, attributes and classes                        >< separator >
	var rulePattern = /^([a-z0-9\-*\s]+)((?:\s*\{[!\w\-,\s\*]+\}\s*|\s*\[[!\w\-,\s\*]+\]\s*|\s*\([!\w\-,\s\*]+\)\s*){0,3})(?:;\s*|$)/i,
		groupsPatterns = {
			styles: /{([^}]+)}/,
			attrs: /\[([^\]]+)\]/,
			classes: /\(([^\)]+)\)/
		};

	function parseRulesString( input ) {
		var match,
			props, styles, attrs, classes,
			rules = {},
			groupNum = 1;

		input = trim( input );

		while ( ( match = input.match( rulePattern ) ) ) {
			if ( ( props = match[ 2 ] ) ) {
				styles = parseProperties( props, 'styles' );
				attrs = parseProperties( props, 'attrs' );
				classes = parseProperties( props, 'classes' );
			} else {
				styles = attrs = classes = null;
			}

			// Add as an unnamed rule, because there can be two rules
			// for one elements set defined in string format.
			rules[ '$' + groupNum++ ] = {
				elements: match[ 1 ],
				classes: classes,
				styles: styles,
				attributes: attrs
			};

			// Move to the next group.
			input = input.slice( match[ 0 ].length );
		}

		return rules;
	}

	// Extract specified properties group (styles, attrs, classes) from
	// what stands after the elements list in string format of allowedContent.
	function parseProperties( properties, groupName ) {
		var group = properties.match( groupsPatterns[ groupName ] );
		return group ? trim( group[ 1 ] ) : null;
	}

	function populateProperties( element ) {
			// Backup styles and classes, because they may be removed by DACRs.
			// We'll need them in updateElement().
		var styles = element.styleBackup = element.attributes.style,
			classes = element.classBackup = element.attributes[ 'class' ];

		// Parse classes and styles if that hasn't been done before.
		if ( !element.styles )
			element.styles = CKEDITOR.tools.parseCssText( styles || '', 1 );
		if ( !element.classes )
			element.classes = classes ? classes.split( /\s+/ ) : [];
	}

	// Filter element protected with a comment.
	// Returns true if protected content is ok, false otherwise.
	function processProtectedElement( that, comment, protectedRegexs, filterOpts ) {
		var source = decodeURIComponent( comment.value.replace( /^\{cke_protected\}/, '' ) ),
			protectedFrag,
			toBeRemoved = [],
			node, i, match;

		// Protected element's and protected source's comments look exactly the same.
		// Check if what we have isn't a protected source instead of protected script/noscript.
		if ( protectedRegexs ) {
			for ( i = 0; i < protectedRegexs.length; ++i ) {
				if ( ( match = source.match( protectedRegexs[ i ] ) ) &&
					match[ 0 ].length == source.length	// Check whether this pattern matches entire source
														// to avoid '<script>alert("<? 1 ?>")</script>' matching
														// the PHP's protectedSource regexp.
				)
					return true;
			}
		}

		protectedFrag = CKEDITOR.htmlParser.fragment.fromHtml( source );

		if ( protectedFrag.children.length == 1 && ( node = protectedFrag.children[ 0 ] ).type == CKEDITOR.NODE_ELEMENT )
			processElement( that, node, toBeRemoved, filterOpts );

		// If protected element has been marked to be removed, return 'false' - comment was rejected.
		return !toBeRemoved.length;
	}

	var unprotectElementsNamesRegexp = /^cke:(object|embed|param)$/,
		protectElementsNamesRegexp = /^(object|embed|param)$/;

	// The actual function which filters, transforms and does other funny things with an element.
	//
	// @param {CKEDITOR.filter} that Context.
	// @param {CKEDITOR.htmlParser.element} element The element to be processed.
	// @param {Array} toBeRemoved Array into which elements rejected by the filter will be pushed.
	// @param {Boolean} [opts.doFilter] Whether element should be filtered.
	// @param {Boolean} [opts.doTransform] Whether transformations should be applied.
	// @param {Boolean} [opts.doCallbacks] Whether to execute element callbacks.
	// @param {Boolean} [opts.toHtml] Set to true if filter used together with htmlDP#toHtml
	// @param {Boolean} [opts.skipRequired] Whether element's required properties shouldn't be verified.
	// @param {Boolean} [opts.skipFinalValidation] Whether to not perform final element validation (a,img).
	// @returns {Number} Possible flags:
	//  * FILTER_ELEMENT_MODIFIED,
	//  * FILTER_SKIP_TREE.
	function processElement( that, element, toBeRemoved, opts ) {
		var status,
			retVal = 0,
			callbacksRetVal;

		// Unprotect elements names previously protected by htmlDataProcessor
		// (see protectElementNames and protectSelfClosingElements functions).
		// Note: body, title, etc. are not protected by htmlDataP (or are protected and then unprotected).
		if ( opts.toHtml )
			element.name = element.name.replace( unprotectElementsNamesRegexp, '$1' );

		// Execute element callbacks and return if one of them returned any value.
		if ( opts.doCallbacks && that.elementCallbacks ) {
			// For now we only support here FILTER_SKIP_TREE, so we can early return if retVal is truly value.
			if ( ( callbacksRetVal = executeElementCallbacks( element, that.elementCallbacks ) ) )
				return callbacksRetVal;
		}

		// If transformations are set apply all groups.
		if ( opts.doTransform )
			transformElement( that, element );

		if ( opts.doFilter ) {
			// Apply all filters.
			status = filterElement( that, element, opts );

			// Handle early return from filterElement.
			if ( !status ) {
				toBeRemoved.push( element );
				return FILTER_ELEMENT_MODIFIED;
			}

			// Finally, if after running all filter rules it still hasn't been allowed - remove it.
			if ( !status.valid ) {
				toBeRemoved.push( element );
				return FILTER_ELEMENT_MODIFIED;
			}

			// Update element's attributes based on status of filtering.
			if ( updateElement( element, status ) )
				retVal = FILTER_ELEMENT_MODIFIED;

			if ( !opts.skipFinalValidation && !validateElement( element ) ) {
				toBeRemoved.push( element );
				return FILTER_ELEMENT_MODIFIED;
			}
		}

		// Protect previously unprotected elements.
		if ( opts.toHtml )
			element.name = element.name.replace( protectElementsNamesRegexp, 'cke:$1' );

		return retVal;
	}

	// Returns a regexp object which can be used to test if a property
	// matches one of wildcard validators.
	function regexifyPropertiesWithWildcards( validators ) {
		var patterns = [],
			i;

		for ( i in validators ) {
			if ( i.indexOf( '*' ) > -1 )
				patterns.push( i.replace( /\*/g, '.*' ) );
		}

		if ( patterns.length )
			return new RegExp( '^(?:' + patterns.join( '|' ) + ')$' );
		else
			return null;
	}

	// Standardize a rule by converting all validators to hashes.
	function standardizeRule( rule ) {
		rule.elements = convertValidatorToHash( rule.elements, /\s+/ ) || null;
		rule.propertiesOnly = rule.propertiesOnly || ( rule.elements === true );

		var delim = /\s*,\s*/,
			i;

		for ( i in validators ) {
			rule[ i ] = convertValidatorToHash( rule[ i ], delim ) || null;
			rule[ validatorsRequired[ i ] ] = extractRequired( convertValidatorToHash(
				rule[ validatorsRequired[ i ] ], delim ), rule[ i ] ) || null;
		}

		rule.match = rule.match || null;
	}

	// Does the element transformation by applying registered
	// transformation rules.
	function transformElement( that, element ) {
		var transformations = that._.transformations[ element.name ],
			i;

		if ( !transformations )
			return;

		populateProperties( element );

		for ( i = 0; i < transformations.length; ++i )
			applyTransformationsGroup( that, element, transformations[ i ] );

		// Do not count on updateElement() which is called in processElement, because it:
		// * may not be called,
		// * may skip some properties when all are marked as valid.
		updateAttributes( element );
	}

	// Copy element's styles and classes back to attributes array.
	function updateAttributes( element ) {
		var attrs = element.attributes,
			styles;

		// Will be recreated later if any of styles/classes exists.
		delete attrs.style;
		delete attrs[ 'class' ];

		if ( ( styles = CKEDITOR.tools.writeCssText( element.styles, true ) ) )
			attrs.style = styles;

		if ( element.classes.length )
			attrs[ 'class' ] = element.classes.sort().join( ' ' );
	}

	// Update element object based on status of filtering.
	// @returns Whether element was modified.
	function updateElement( element, status ) {
		var validAttrs = status.validAttributes,
			validStyles = status.validStyles,
			validClasses = status.validClasses,
			attrs = element.attributes,
			styles = element.styles,
			classes = element.classes,
			origClasses = element.classBackup,
			origStyles = element.styleBackup,
			name, origName, i,
			stylesArr = [],
			classesArr = [],
			internalAttr = /^data-cke-/,
			isModified = false;

		// Will be recreated later if any of styles/classes were passed.
		delete attrs.style;
		delete attrs[ 'class' ];
		// Clean up.
		delete element.classBackup;
		delete element.styleBackup;

		if ( !status.allAttributes ) {
			for ( name in attrs ) {
				// If not valid and not internal attribute delete it.
				if ( !validAttrs[ name ] ) {
					// Allow all internal attibutes...
					if ( internalAttr.test( name ) ) {
						// ... unless this is a saved attribute and the original one isn't allowed.
						if ( name != ( origName = name.replace( /^data-cke-saved-/, '' ) ) &&
							!validAttrs[ origName ]
						) {
							delete attrs[ name ];
							isModified = true;
						}
					} else {
						delete attrs[ name ];
						isModified = true;
					}
				}

			}
		}

		if ( !status.allStyles || status.hadInvalidStyle ) {
			for ( name in styles ) {
				// We check status.allStyles because when there was a '*' ACR and some
				// DACR we have now both properties true - status.allStyles and status.hadInvalidStyle.
				// However unlike in the case when we only have '*' ACR, in which we can just copy original
				// styles, in this case we must copy only those styles which were not removed by DACRs.
				if ( status.allStyles || validStyles[ name ] )
					stylesArr.push( name + ':' + styles[ name ] );
				else
					isModified = true;
			}
			if ( stylesArr.length )
				attrs.style = stylesArr.sort().join( '; ' );
		}
		else if ( origStyles ) {
			attrs.style = origStyles;
		}

		if ( !status.allClasses || status.hadInvalidClass ) {
			for ( i = 0; i < classes.length; ++i ) {
				// See comment for styles.
				if ( status.allClasses || validClasses[ classes[ i ] ] )
					classesArr.push( classes[ i ] );
			}
			if ( classesArr.length )
				attrs[ 'class' ] = classesArr.sort().join( ' ' );

			if ( origClasses && classesArr.length < origClasses.split( /\s+/ ).length )
				isModified = true;
		}
		else if ( origClasses ) {
			attrs[ 'class' ] = origClasses;
		}

		return isModified;
	}

	function validateElement( element ) {
		switch ( element.name ) {
			case 'a':
				// Code borrowed from htmlDataProcessor, so ACF does the same clean up.
				if ( !( element.children.length || element.attributes.name || element.attributes.id ) )
					return false;
				break;
			case 'img':
				if ( !element.attributes.src )
					return false;
				break;
		}

		return true;
	}

	function validatorFunction( validator ) {
		if ( !validator )
			return false;
		if ( validator === true )
			return true;

		// Note: We don't need to remove properties with wildcards from the validator object.
		// E.g. data-* is actually an edge case of /^data-.*$/, so when it's accepted
		// by `value in validator` it's ok.
		var regexp = regexifyPropertiesWithWildcards( validator );

		return function( value ) {
			return value in validator || ( regexp && value.match( regexp ) );
		};
	}

	//
	// REMOVE ELEMENT ---------------------------------------------------------
	//

	// Check whether all children will be valid in new context.
	// Note: it doesn't verify if text node is valid, because
	// new parent should accept them.
	function checkChildren( children, newParentName ) {
		var allowed = DTD[ newParentName ];

		for ( var i = 0, l = children.length, child; i < l; ++i ) {
			child = children[ i ];
			if ( child.type == CKEDITOR.NODE_ELEMENT && !allowed[ child.name ] )
				return false;
		}

		return true;
	}

	function createBr() {
		return new CKEDITOR.htmlParser.element( 'br' );
	}

	// Whether this is an inline element or text.
	function inlineNode( node ) {
		return node.type == CKEDITOR.NODE_TEXT ||
			node.type == CKEDITOR.NODE_ELEMENT && DTD.$inline[ node.name ];
	}

	function isBrOrBlock( node ) {
		return node.type == CKEDITOR.NODE_ELEMENT &&
			( node.name == 'br' || DTD.$block[ node.name ] );
	}

	// Try to remove element in the best possible way.
	//
	// @param {Array} toBeChecked After executing this function
	// this array will contain elements that should be checked
	// because they were marked as potentially:
	// * in wrong context (e.g. li in body),
	// * empty elements from $removeEmpty,
	// * incorrect img/a/other element validated by validateElement().
	function removeElement( element, enterTag, toBeChecked ) {
		var name = element.name;

		if ( DTD.$empty[ name ] || !element.children.length ) {
			// Special case - hr in br mode should be replaced with br, not removed.
			if ( name == 'hr' && enterTag == 'br' )
				element.replaceWith( createBr() );
			else {
				// Parent might become an empty inline specified in $removeEmpty or empty a[href].
				if ( element.parent )
					toBeChecked.push( { check: 'it', el: element.parent } );

				element.remove();
			}
		} else if ( DTD.$block[ name ] || name == 'tr' ) {
			if ( enterTag == 'br' )
				stripBlockBr( element, toBeChecked );
			else
				stripBlock( element, enterTag, toBeChecked );
		}
		// Special case - elements that may contain CDATA should be removed completely.
		else if ( name in { style: 1, script: 1 } )
			element.remove();
		// The rest of inline elements. May also be the last resort
		// for some special elements.
		else {
			// Parent might become an empty inline specified in $removeEmpty or empty a[href].
			if ( element.parent )
				toBeChecked.push( { check: 'it', el: element.parent } );
			element.replaceWithChildren();
		}
	}

	// Strip element block, but leave its content.
	// Works in 'div' and 'p' enter modes.
	function stripBlock( element, enterTag, toBeChecked ) {
		var children = element.children;

		// First, check if element's children may be wrapped with <p/div>.
		// Ignore that <p/div> may not be allowed in element.parent.
		// This will be fixed when removing parent or by toBeChecked rule.
		if ( checkChildren( children, enterTag ) ) {
			element.name = enterTag;
			element.attributes = {};
			// Check if this p/div was put in correct context.
			// If not - strip parent.
			toBeChecked.push( { check: 'parent-down', el: element } );
			return;
		}

		var parent = element.parent,
			shouldAutoP = parent.type == CKEDITOR.NODE_DOCUMENT_FRAGMENT || parent.name == 'body',
			i, child, p, parentDtd;

		for ( i = children.length; i > 0; ) {
			child = children[ --i ];

			// If parent requires auto paragraphing and child is inline node,
			// insert this child into newly created paragraph.
			if ( shouldAutoP && inlineNode( child )  ) {
				if ( !p ) {
					p = new CKEDITOR.htmlParser.element( enterTag );
					p.insertAfter( element );

					// Check if this p/div was put in correct context.
					// If not - strip parent.
					toBeChecked.push( { check: 'parent-down', el: p } );
				}
				p.add( child, 0 );
			}
			// Child which doesn't need to be auto paragraphed.
			else {
				p = null;
				parentDtd = DTD[ parent.name ] || DTD.span;

				child.insertAfter( element );
				// If inserted into invalid context, mark it and check
				// after removing all elements.
				if ( parent.type != CKEDITOR.NODE_DOCUMENT_FRAGMENT &&
					child.type == CKEDITOR.NODE_ELEMENT &&
					!parentDtd[ child.name ]
				)
					toBeChecked.push( { check: 'el-up', el: child } );
			}
		}

		// All children have been moved to element's parent, so remove it.
		element.remove();
	}

	// Prepend/append block with <br> if isn't
	// already prepended/appended with <br> or block and
	// isn't first/last child of its parent.
	// Then replace element with its children.
	// <p>a</p><p>b</p> => <p>a</p><br>b => a<br>b
	function stripBlockBr( element ) {
		var br;

		if ( element.previous && !isBrOrBlock( element.previous ) ) {
			br = createBr();
			br.insertBefore( element );
		}

		if ( element.next && !isBrOrBlock( element.next ) ) {
			br = createBr();
			br.insertAfter( element );
		}

		element.replaceWithChildren();
	}

	//
	// TRANSFORMATIONS --------------------------------------------------------
	//
	var transformationsTools;

	// Apply given transformations group to the element.
	function applyTransformationsGroup( filter, element, group ) {
		var i, rule;

		for ( i = 0; i < group.length; ++i ) {
			rule = group[ i ];

			// Test with #check or #left only if it's set.
			// Do not apply transformations because that creates infinite loop.
			if ( ( !rule.check || filter.check( rule.check, false ) ) &&
				( !rule.left || rule.left( element ) ) ) {
				rule.right( element, transformationsTools );
				return; // Only first matching rule in a group is executed.
			}
		}
	}

	// Check whether element matches CKEDITOR.style.
	// The element can be a "superset" of style,
	// e.g. it may have more classes, but need to have
	// at least those defined in style.
	function elementMatchesStyle( element, style ) {
		var def = style.getDefinition(),
			defAttrs = def.attributes,
			defStyles = def.styles,
			attrName, styleName,
			classes, classPattern, cl;

		if ( element.name != def.element )
			return false;

		for ( attrName in defAttrs ) {
			if ( attrName == 'class' ) {
				classes = defAttrs[ attrName ].split( /\s+/ );
				classPattern = element.classes.join( '|' );
				while ( ( cl = classes.pop() ) ) {
					if ( classPattern.indexOf( cl ) == -1 )
						return false;
				}
			} else {
				if ( element.attributes[ attrName ] != defAttrs[ attrName ] )
					return false;
			}
		}

		for ( styleName in defStyles ) {
			if ( element.styles[ styleName ] != defStyles[ styleName ] )
				return false;
		}

		return true;
	}

	// Return transformation group for content form.
	// One content form makes one transformation rule in one group.
	function getContentFormTransformationGroup( form, preferredForm ) {
		var element, left;

		if ( typeof form == 'string' )
			element = form;
		else if ( form instanceof CKEDITOR.style )
			left = form;
		else {
			element = form[ 0 ];
			left = form[ 1 ];
		}

		return [ {
			element: element,
			left: left,
			right: function( el, tools ) {
				tools.transform( el, preferredForm );
			}
		} ];
	}

	// Obtain element's name from transformation rule.
	// It will be defined by #element, or #check or #left (styleDef.element).
	function getElementNameForTransformation( rule, check ) {
		if ( rule.element )
			return rule.element;
		if ( check )
			return check.match( /^([a-z0-9]+)/i )[ 0 ];
		return rule.left.getDefinition().element;
	}

	function getMatchStyleFn( style ) {
		return function( el ) {
			return elementMatchesStyle( el, style );
		};
	}

	function getTransformationFn( toolName ) {
		return function( el, tools ) {
			tools[ toolName ]( el );
		};
	}

	function optimizeTransformationsGroup( rules ) {
		var groupName, i, rule,
			check, left, right,
			optimizedRules = [];

		for ( i = 0; i < rules.length; ++i ) {
			rule = rules[ i ];

			if ( typeof rule == 'string' ) {
				rule = rule.split( /\s*:\s*/ );
				check = rule[ 0 ];
				left = null;
				right = rule[ 1 ];
			} else {
				check = rule.check;
				left = rule.left;
				right = rule.right;
			}

			// Extract element name.
			if ( !groupName )
				groupName = getElementNameForTransformation( rule, check );

			if ( left instanceof CKEDITOR.style )
				left = getMatchStyleFn( left );

			optimizedRules.push( {
				// It doesn't make sense to test against name rule (e.g. 'table'), so don't save it.
				check: check == groupName ? null : check,

				left: left,

				// Handle shorthand format. E.g.: 'table[width]:sizeToAttribute'.
				right: typeof right == 'string' ? getTransformationFn( right ) : right
			} );
		}

		return {
			name: groupName,
			rules: optimizedRules
		};
	}

	
	transformationsTools = CKEDITOR.filter.transformationsTools = {
		
		sizeToStyle: function( element ) {
			this.lengthToStyle( element, 'width' );
			this.lengthToStyle( element, 'height' );
		},

		
		sizeToAttribute: function( element ) {
			this.lengthToAttribute( element, 'width' );
			this.lengthToAttribute( element, 'height' );
		},

		
		lengthToStyle: function( element, attrName, styleName ) {
			styleName = styleName || attrName;

			if ( !( styleName in element.styles ) ) {
				var value = element.attributes[ attrName ];

				if ( value ) {
					if ( ( /^\d+$/ ).test( value ) )
						value += 'px';

					element.styles[ styleName ] = value;
				}
			}

			delete element.attributes[ attrName ];
		},

		
		lengthToAttribute: function( element, styleName, attrName ) {
			attrName = attrName || styleName;

			if ( !( attrName in element.attributes ) ) {
				var value = element.styles[ styleName ],
					match = value && value.match( /^(\d+)(?:\.\d*)?px$/ );

				if ( match )
					element.attributes[ attrName ] = match[ 1 ];
				// Pass the TEST_VALUE used by filter#check when mocking element.
				else if ( value == TEST_VALUE )
					element.attributes[ attrName ] = TEST_VALUE;
			}

			delete element.styles[ styleName ];
		},

		
		alignmentToStyle: function( element ) {
			if ( !( 'float' in element.styles ) ) {
				var value = element.attributes.align;

				if ( value == 'left' || value == 'right' )
					element.styles[ 'float' ] = value; // Uh... GCC doesn't like the 'float' prop name.
			}

			delete element.attributes.align;
		},

		
		alignmentToAttribute: function( element ) {
			if ( !( 'align' in element.attributes ) ) {
				var value = element.styles[ 'float' ];

				if ( value == 'left' || value == 'right' )
					element.attributes.align = value;
			}

			delete element.styles[ 'float' ]; // Uh... GCC doesn't like the 'float' prop name.
		},

		
		matchesStyle: elementMatchesStyle,

		
		transform: function( el, form ) {
			if ( typeof form == 'string' )
				el.name = form;
			// Form is an instance of CKEDITOR.style.
			else {
				var def = form.getDefinition(),
					defStyles = def.styles,
					defAttrs = def.attributes,
					attrName, styleName,
					existingClassesPattern, defClasses, cl;

				el.name = def.element;

				for ( attrName in defAttrs ) {
					if ( attrName == 'class' ) {
						existingClassesPattern = el.classes.join( '|' );
						defClasses = defAttrs[ attrName ].split( /\s+/ );

						while ( ( cl = defClasses.pop() ) ) {
							if ( existingClassesPattern.indexOf( cl ) == -1 )
								el.classes.push( cl );
						}
					} else {
						el.attributes[ attrName ] = defAttrs[ attrName ];
					}

				}

				for ( styleName in defStyles ) {
					el.styles[ styleName ] = defStyles[ styleName ];
				}
			}
		}
	};

} )();




























