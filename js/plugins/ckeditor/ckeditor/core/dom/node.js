




CKEDITOR.dom.node = function( domNode ) {
	if ( domNode ) {
		var type =
			domNode.nodeType == CKEDITOR.NODE_DOCUMENT ? 'document' :
			domNode.nodeType == CKEDITOR.NODE_ELEMENT ? 'element' :
			domNode.nodeType == CKEDITOR.NODE_TEXT ? 'text' :
			domNode.nodeType == CKEDITOR.NODE_COMMENT ? 'comment' :
			domNode.nodeType == CKEDITOR.NODE_DOCUMENT_FRAGMENT ? 'documentFragment' :
			'domObject'; // Call the base constructor otherwise.

		return new CKEDITOR.dom[ type ]( domNode );
	}

	return this;
};

CKEDITOR.dom.node.prototype = new CKEDITOR.dom.domObject();


CKEDITOR.NODE_ELEMENT = 1;


CKEDITOR.NODE_DOCUMENT = 9;


CKEDITOR.NODE_TEXT = 3;


CKEDITOR.NODE_COMMENT = 8;


CKEDITOR.NODE_DOCUMENT_FRAGMENT = 11;


CKEDITOR.POSITION_IDENTICAL = 0;


CKEDITOR.POSITION_DISCONNECTED = 1;


CKEDITOR.POSITION_FOLLOWING = 2;


CKEDITOR.POSITION_PRECEDING = 4;


CKEDITOR.POSITION_IS_CONTAINED = 8;


CKEDITOR.POSITION_CONTAINS = 16;

CKEDITOR.tools.extend( CKEDITOR.dom.node.prototype, {
	
	appendTo: function( element, toStart ) {
		element.append( this, toStart );
		return element;
	},

	
	clone: function( includeChildren, cloneId ) {
		var $clone = this.$.cloneNode( includeChildren );

		// The "id" attribute should never be cloned to avoid duplication.
		removeIds( $clone );

		var node = new CKEDITOR.dom.node( $clone );

		// On IE8 we need to fixed HTML5 node name, see details below.
		if ( CKEDITOR.env.ie && CKEDITOR.env.version < 9 &&
			( this.type == CKEDITOR.NODE_ELEMENT || this.type == CKEDITOR.NODE_DOCUMENT_FRAGMENT ) ) {
			renameNodes( node );
		}

		return node;

		function removeIds( node ) {
			// Reset data-cke-expando only when has been cloned (IE and only for some types of objects).
			if ( node[ 'data-cke-expando' ] )
				node[ 'data-cke-expando' ] = false;

			if ( node.nodeType != CKEDITOR.NODE_ELEMENT && node.nodeType != CKEDITOR.NODE_DOCUMENT_FRAGMENT  )
				return;

			if ( !cloneId && node.nodeType == CKEDITOR.NODE_ELEMENT )
				node.removeAttribute( 'id', false );

			if ( includeChildren ) {
				var childs = node.childNodes;
				for ( var i = 0; i < childs.length; i++ )
					removeIds( childs[ i ] );
			}
		}

		// IE8 rename HTML5 nodes by adding `:` at the begging of the tag name when the node is cloned,
		// so `<figure>` will be `<:figure>` after 'cloneNode'. We need to fix it (#13101).
		function renameNodes( node ) {
			if ( node.type != CKEDITOR.NODE_ELEMENT && node.type != CKEDITOR.NODE_DOCUMENT_FRAGMENT )
				return;

			if ( node.type != CKEDITOR.NODE_DOCUMENT_FRAGMENT ) {
				var name = node.getName();
				if ( name[ 0 ] == ':' ) {
					node.renameNode( name.substring( 1 ) );
				}
			}

			if ( includeChildren ) {
				for ( var i = 0; i < node.getChildCount(); i++ )
					renameNodes( node.getChild( i ) );
			}
		}
	},

	
	hasPrevious: function() {
		return !!this.$.previousSibling;
	},

	
	hasNext: function() {
		return !!this.$.nextSibling;
	},

	
	insertAfter: function( node ) {
		node.$.parentNode.insertBefore( this.$, node.$.nextSibling );
		return node;
	},

	
	insertBefore: function( node ) {
		node.$.parentNode.insertBefore( this.$, node.$ );
		return node;
	},

	
	insertBeforeMe: function( node ) {
		this.$.parentNode.insertBefore( node.$, this.$ );
		return node;
	},

	
	getAddress: function( normalized ) {
		var address = [];
		var $documentElement = this.getDocument().$.documentElement;
		var node = this.$;

		while ( node && node != $documentElement ) {
			var parentNode = node.parentNode;

			if ( parentNode ) {
				// Get the node index. For performance, call getIndex
				// directly, instead of creating a new node object.
				address.unshift( this.getIndex.call( { $: node }, normalized ) );
			}

			node = parentNode;
		}

		return address;
	},

	
	getDocument: function() {
		return new CKEDITOR.dom.document( this.$.ownerDocument || this.$.parentNode.ownerDocument );
	},

	
	getIndex: function( normalized ) {
		// Attention: getAddress depends on this.$
		// getIndex is called on a plain object: { $ : node }

		var current = this.$,
			index = -1,
			isNormalizing;

		if ( !this.$.parentNode )
			return -1;

		// The idea is - all empty text nodes will be virtually merged into their adjacent text nodes.
		// If an empty text node does not have an adjacent non-empty text node we can return -1 straight away,
		// because it and all its sibling text nodes will be merged into an empty text node and then totally ignored.
		if ( normalized && current.nodeType == CKEDITOR.NODE_TEXT && isEmpty( current ) ) {
			var adjacent = getAdjacentNonEmptyTextNode( current ) || getAdjacentNonEmptyTextNode( current, true );

			if ( !adjacent )
				return -1;
		}

		do {
			// Bypass blank node and adjacent text nodes.
			if ( normalized && current != this.$ && current.nodeType == CKEDITOR.NODE_TEXT && ( isNormalizing || isEmpty( current ) ) )
				continue;

			index++;
			isNormalizing = current.nodeType == CKEDITOR.NODE_TEXT;
		}
		while ( ( current = current.previousSibling ) );

		return index;

		function getAdjacentNonEmptyTextNode( node, lookForward ) {
			var sibling = lookForward ? node.nextSibling : node.previousSibling;

			if ( !sibling || sibling.nodeType != CKEDITOR.NODE_TEXT ) {
				return null;
			}

			// If found a non-empty text node, then return it.
			// If not, then continue search.
			return isEmpty( sibling ) ? getAdjacentNonEmptyTextNode( sibling, lookForward ) : sibling;
		}

		// Checks whether a text node is empty or is FCSeq string (which will be totally removed when normalizing).
		function isEmpty( textNode ) {
			return !textNode.nodeValue || textNode.nodeValue == CKEDITOR.dom.selection.FILLING_CHAR_SEQUENCE;
		}
	},

	
	getNextSourceNode: function( startFromSibling, nodeType, guard ) {
		// If "guard" is a node, transform it in a function.
		if ( guard && !guard.call ) {
			var guardNode = guard;
			guard = function( node ) {
				return !node.equals( guardNode );
			};
		}

		var node = ( !startFromSibling && this.getFirst && this.getFirst() ),
			parent;

		// Guarding when we're skipping the current element( no children or 'startFromSibling' ).
		// send the 'moving out' signal even we don't actually dive into.
		if ( !node ) {
			if ( this.type == CKEDITOR.NODE_ELEMENT && guard && guard( this, true ) === false )
				return null;
			node = this.getNext();
		}

		while ( !node && ( parent = ( parent || this ).getParent() ) ) {
			// The guard check sends the "true" paramenter to indicate that
			// we are moving "out" of the element.
			if ( guard && guard( parent, true ) === false )
				return null;

			node = parent.getNext();
		}

		if ( !node )
			return null;

		if ( guard && guard( node ) === false )
			return null;

		if ( nodeType && nodeType != node.type )
			return node.getNextSourceNode( false, nodeType, guard );

		return node;
	},

	
	getPreviousSourceNode: function( startFromSibling, nodeType, guard ) {
		if ( guard && !guard.call ) {
			var guardNode = guard;
			guard = function( node ) {
				return !node.equals( guardNode );
			};
		}

		var node = ( !startFromSibling && this.getLast && this.getLast() ),
			parent;

		// Guarding when we're skipping the current element( no children or 'startFromSibling' ).
		// send the 'moving out' signal even we don't actually dive into.
		if ( !node ) {
			if ( this.type == CKEDITOR.NODE_ELEMENT && guard && guard( this, true ) === false )
				return null;
			node = this.getPrevious();
		}

		while ( !node && ( parent = ( parent || this ).getParent() ) ) {
			// The guard check sends the "true" paramenter to indicate that
			// we are moving "out" of the element.
			if ( guard && guard( parent, true ) === false )
				return null;

			node = parent.getPrevious();
		}

		if ( !node )
			return null;

		if ( guard && guard( node ) === false )
			return null;

		if ( nodeType && node.type != nodeType )
			return node.getPreviousSourceNode( false, nodeType, guard );

		return node;
	},

	
	getPrevious: function( evaluator ) {
		var previous = this.$,
			retval;
		do {
			previous = previous.previousSibling;

			// Avoid returning the doc type node.
			// http://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-412266927
			retval = previous && previous.nodeType != 10 && new CKEDITOR.dom.node( previous );
		}
		while ( retval && evaluator && !evaluator( retval ) );
		return retval;
	},

	
	getNext: function( evaluator ) {
		var next = this.$,
			retval;
		do {
			next = next.nextSibling;
			retval = next && new CKEDITOR.dom.node( next );
		}
		while ( retval && evaluator && !evaluator( retval ) );
		return retval;
	},

	
	getParent: function( allowFragmentParent ) {
		var parent = this.$.parentNode;
		return ( parent && ( parent.nodeType == CKEDITOR.NODE_ELEMENT || allowFragmentParent && parent.nodeType == CKEDITOR.NODE_DOCUMENT_FRAGMENT ) ) ? new CKEDITOR.dom.node( parent ) : null;
	},

	
	getParents: function( closerFirst ) {
		var node = this;
		var parents = [];

		do {
			parents[ closerFirst ? 'push' : 'unshift' ]( node );
		}
		while ( ( node = node.getParent() ) );

		return parents;
	},

	
	getCommonAncestor: function( node ) {
		if ( node.equals( this ) )
			return this;

		if ( node.contains && node.contains( this ) )
			return node;

		var start = this.contains ? this : this.getParent();

		do {
			if ( start.contains( node ) ) return start;
		}
		while ( ( start = start.getParent() ) );

		return null;
	},

	
	getPosition: function( otherNode ) {
		var $ = this.$;
		var $other = otherNode.$;

		if ( $.compareDocumentPosition )
			return $.compareDocumentPosition( $other );

		// IE and Safari have no support for compareDocumentPosition.

		if ( $ == $other )
			return CKEDITOR.POSITION_IDENTICAL;

		// Only element nodes support contains and sourceIndex.
		if ( this.type == CKEDITOR.NODE_ELEMENT && otherNode.type == CKEDITOR.NODE_ELEMENT ) {
			if ( $.contains ) {
				if ( $.contains( $other ) )
					return CKEDITOR.POSITION_CONTAINS + CKEDITOR.POSITION_PRECEDING;

				if ( $other.contains( $ ) )
					return CKEDITOR.POSITION_IS_CONTAINED + CKEDITOR.POSITION_FOLLOWING;
			}

			if ( 'sourceIndex' in $ )
				return ( $.sourceIndex < 0 || $other.sourceIndex < 0 ) ? CKEDITOR.POSITION_DISCONNECTED : ( $.sourceIndex < $other.sourceIndex ) ? CKEDITOR.POSITION_PRECEDING : CKEDITOR.POSITION_FOLLOWING;

		}

		// For nodes that don't support compareDocumentPosition, contains
		// or sourceIndex, their "address" is compared.

		var addressOfThis = this.getAddress(),
			addressOfOther = otherNode.getAddress(),
			minLevel = Math.min( addressOfThis.length, addressOfOther.length );

		// Determinate preceding/following relationship.
		for ( var i = 0; i < minLevel; i++ ) {
			if ( addressOfThis[ i ] != addressOfOther[ i ] ) {
				return addressOfThis[ i ] < addressOfOther[ i ] ? CKEDITOR.POSITION_PRECEDING : CKEDITOR.POSITION_FOLLOWING;
			}
		}

		// Determinate contains/contained relationship.
		return ( addressOfThis.length < addressOfOther.length ) ? CKEDITOR.POSITION_CONTAINS + CKEDITOR.POSITION_PRECEDING : CKEDITOR.POSITION_IS_CONTAINED + CKEDITOR.POSITION_FOLLOWING;
	},

	
	getAscendant: function( query, includeSelf ) {
		var $ = this.$,
			evaluator,
			isCustomEvaluator;

		if ( !includeSelf ) {
			$ = $.parentNode;
		}

		// Custom checker provided in an argument.
		if ( typeof query == 'function' ) {
			isCustomEvaluator = true;
			evaluator = query;
		} else {
			// Predefined tag name checker.
			isCustomEvaluator = false;
			evaluator = function( $ ) {
				var name = ( typeof $.nodeName == 'string' ? $.nodeName.toLowerCase() : '' );

				return ( typeof query == 'string' ? name == query : name in query );
			};
		}

		while ( $ ) {
			// For user provided checker we use CKEDITOR.dom.node.
			if ( evaluator( isCustomEvaluator ? new CKEDITOR.dom.node( $ ) : $ ) ) {
				return new CKEDITOR.dom.node( $ );
			}

			try {
				$ = $.parentNode;
			} catch ( e ) {
				$ = null;
			}
		}

		return null;
	},

	
	hasAscendant: function( name, includeSelf ) {
		var $ = this.$;

		if ( !includeSelf )
			$ = $.parentNode;

		while ( $ ) {
			if ( $.nodeName && $.nodeName.toLowerCase() == name )
				return true;

			$ = $.parentNode;
		}
		return false;
	},

	
	move: function( target, toStart ) {
		target.append( this.remove(), toStart );
	},

	
	remove: function( preserveChildren ) {
		var $ = this.$;
		var parent = $.parentNode;

		if ( parent ) {
			if ( preserveChildren ) {
				// Move all children before the node.
				for ( var child;
				( child = $.firstChild ); ) {
					parent.insertBefore( $.removeChild( child ), $ );
				}
			}

			parent.removeChild( $ );
		}

		return this;
	},

	
	replace: function( nodeToReplace ) {
		this.insertBefore( nodeToReplace );
		nodeToReplace.remove();
	},

	
	trim: function() {
		this.ltrim();
		this.rtrim();
	},

	
	ltrim: function() {
		var child;
		while ( this.getFirst && ( child = this.getFirst() ) ) {
			if ( child.type == CKEDITOR.NODE_TEXT ) {
				var trimmed = CKEDITOR.tools.ltrim( child.getText() ),
					originalLength = child.getLength();

				if ( !trimmed ) {
					child.remove();
					continue;
				} else if ( trimmed.length < originalLength ) {
					child.split( originalLength - trimmed.length );

					// IE BUG: child.remove() may raise JavaScript errors here. (#81)
					this.$.removeChild( this.$.firstChild );
				}
			}
			break;
		}
	},

	
	rtrim: function() {
		var child;
		while ( this.getLast && ( child = this.getLast() ) ) {
			if ( child.type == CKEDITOR.NODE_TEXT ) {
				var trimmed = CKEDITOR.tools.rtrim( child.getText() ),
					originalLength = child.getLength();

				if ( !trimmed ) {
					child.remove();
					continue;
				} else if ( trimmed.length < originalLength ) {
					child.split( trimmed.length );

					// IE BUG: child.getNext().remove() may raise JavaScript errors here.
					// (#81)
					this.$.lastChild.parentNode.removeChild( this.$.lastChild );
				}
			}
			break;
		}

		if ( CKEDITOR.env.needsBrFiller ) {
			child = this.$.lastChild;

			if ( child && child.type == 1 && child.nodeName.toLowerCase() == 'br' ) {
				// Use "eChildNode.parentNode" instead of "node" to avoid IE bug (#324).
				child.parentNode.removeChild( child );
			}
		}
	},

	
	isReadOnly: function( checkOnlyAttributes ) {
		var element = this;
		if ( this.type != CKEDITOR.NODE_ELEMENT )
			element = this.getParent();

		// Prevent Edge crash (#13609, #13919).
		if ( CKEDITOR.env.edge && element && element.is( 'textarea', 'input' ) ) {
			checkOnlyAttributes = true;
		}

		if ( !checkOnlyAttributes && element && typeof element.$.isContentEditable != 'undefined' ) {
			return !( element.$.isContentEditable || element.data( 'cke-editable' ) );
		}
		else {
			// Degrade for old browsers which don't support "isContentEditable", e.g. FF3

			while ( element ) {
				if ( element.data( 'cke-editable' ) ) {
					return false;
				} else if ( element.hasAttribute( 'contenteditable' ) ) {
					return element.getAttribute( 'contenteditable' ) == 'false';
				}

				element = element.getParent();
			}

			// Reached the root of DOM tree, no editable found.
			return true;
		}
	}
} );
