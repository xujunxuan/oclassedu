define([
    'app'
    , 'text!modules/library/templates/index.html'
],function(
    app
    , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        title: '首页'
        , template: _.template(template)
        , events: {
            'submit #search-form': 'search'
            , 'click .more-btn a': 'toggleMore'
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template({index: this.model.toJSON(), site: this.options.site}));
            return this;
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
        , search: function(e){
            e.preventDefault();
            var keyword = $(e.currentTarget).find('[name=keyword]').val();
            location.href = '#!/search/' + keyword + '/';
        }

    });
    return View;
});