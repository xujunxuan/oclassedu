define([
    'app'
    , 'text!modules/library/templates/detail_document.html'
],function(
    app
    , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('data_info').content.title;
        }
        , events: {
            'click .more-btn a': 'toggleMore'
        }
        , initialize: function(options){
            var self = this;
            this.options = options || {};
            this.type = this.model.get('data_info').content.file.type;
            this.html = null;
            $.get(this.model.get('data_info').content.file.url_path, function(html){
                self.html = html;
                self.render();
            },'html');
        }
        , render: function(){
            this.$el.html(this.template(this.model.toJSON()));
//            $.get(this.model.get('data_info').content.file.url_path, function(data){
//                if(self.type == 'doc' || self.type == 'docx'){
//                    data = data.replace('<body', '<body><div class="page"').replace('</body>','</div></body>');
//                }
//                self.$('#viewer .container').html($(data).filter('.page'));
//            },'html');
            this.buildReader();

            return this;
        }
        , buildReader: function(){
            var self = this;
            if(this.type == 'doc' || this.type == 'docx'){
                var page = $('<div class="page"></div>');
                this.$('#reader').append(page);
                _.each($(this.html),function(el){
                    if(el.tagName == 'META' || el.tagName == 'TITLE' || el.tagName == 'LINK' || el.tagName == 'STYLE') return true;
                    if(page.height() > 800){
                        self.$('#reader').append('<div class="page"></div>');
                        page = self.$('#reader .page:last');
                    }
                    page.append(el);
                });
            }else if(this.type = 'pdf'){
                this.$('#reader').html($(this.html).filter('.page'));
            }
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
    });
    return View;
});